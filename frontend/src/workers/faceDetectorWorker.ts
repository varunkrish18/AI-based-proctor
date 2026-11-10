/**
 * Face, Pose, Blur & Object Detection Web Worker
 * Adapted from ViBe (vicharanashala/vibe):
 * - FaceDetectorWorker.ts / face-count-worker.ts (TensorFlow.js MediaPipeFaceDetector)
 * - FaceDetectors.tsx (Geometric eye/nose/ear head-pose & looking-away heuristics)
 * - BlurDetectorWorker.ts (Laplacian variance blur & camera occlusion check)
 * - TensorFlow.js COCO-SSD (Real-time prohibited object, mobile phone & multi-person detection)
 */

import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs";
import * as faceDetection from "@tensorflow-models/face-detection";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

let detector: faceDetection.FaceDetector | null = null;
let objectDetector: cocoSsd.ObjectDetection | null = null;
let isProcessing = false;
let frameCounter = 0;

let cachedObjectState: {
  objectDetected: boolean;
  phoneDetected: boolean;
  detectedObjects: string[];
  personCount: number;
  updatedAt: number;
} = {
  objectDetected: false,
  phoneDetected: false,
  detectedObjects: [],
  personCount: 0,
  updatedAt: 0,
};

export interface Keypoint {
  x: number;
  y: number;
  name?: string;
}

export type GazeDirection = "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";

interface PoseEvaluation {
  isLookingAway: boolean;
  gazeDirection: GazeDirection;
}

const PROHIBITED_OBJECT_CLASSES = new Set([
  "cell phone",
  "book",
  "laptop",
  "remote",
  "tv",
]);

/**
 * Geometric heuristic from ViBe (FaceDetectors.tsx) to detect looking away / head turned,
 * augmented with directional classification (LEFT, RIGHT, UP, DOWN, CENTER).
 */
function evaluatePoseAndGaze(face: any): PoseEvaluation {
  if (!face || !face.keypoints || face.keypoints.length < 4 || !face.box) {
    return { isLookingAway: false, gazeDirection: "CENTER" };
  }

  const rightEye = face.keypoints.find((p: Keypoint) => p.name === "rightEye");
  const leftEye = face.keypoints.find((p: Keypoint) => p.name === "leftEye");
  const noseTip = face.keypoints.find((p: Keypoint) => p.name === "noseTip");
  const mouthCenter = face.keypoints.find((p: Keypoint) => p.name === "mouthCenter");
  const rightEar = face.keypoints.find((p: Keypoint) => p.name === "rightEarTragion");
  const leftEar = face.keypoints.find((p: Keypoint) => p.name === "leftEarTragion");

  if (!rightEye || !leftEye || !noseTip) {
    return { isLookingAway: false, gazeDirection: "CENTER" };
  }

  const faceWidth = Math.max(1, face.box.width || 1);
  const faceHeight = Math.max(1, face.box.height || 1);

  // 1. ViBe Eye distance ratio
  const eyeDistance =
    (Math.abs(leftEye.x - rightEye.x) / faceWidth / Math.pow(faceHeight, 0.1)) * 1.7;

  // 2. ViBe Nose-to-eye symmetry ratio (horizontal yaw detection)
  const noseToLeftEye = Math.abs(noseTip.x - leftEye.x);
  const noseToRightEye = Math.abs(noseTip.x - rightEye.x);
  const maxNoseDist = Math.max(noseToLeftEye, noseToRightEye) || 1;
  const minNoseDist = Math.min(noseToLeftEye, noseToRightEye);
  const noseRatio =
    (minNoseDist / maxNoseDist) * (Math.pow(faceHeight, 0.2) / Math.pow(200, 0.2));

  // 3. ViBe Ear visibility ratio
  let earVisibilityRatio = 1;
  if (rightEar && leftEar) {
    const rightEarDist = Math.abs(rightEar.x - rightEye.x);
    const leftEarDist = Math.abs(leftEar.x - leftEye.x);
    const maxEar = Math.max(rightEarDist, leftEarDist) || 1;
    const minEar = Math.min(rightEarDist, leftEarDist);
    earVisibilityRatio =
      (minEar / maxEar) * (Math.pow(faceHeight, 0.3) / Math.pow(200, 0.3));
  }

  // Horizontal yaw check (ViBe thresholds)
  const isYawAway =
    eyeDistance < 0.35 || noseRatio < 0.47 || earVisibilityRatio < 0.47;

  if (isYawAway) {
    const direction: GazeDirection =
      noseToRightEye < noseToLeftEye ? "RIGHT" : "LEFT";
    return { isLookingAway: true, gazeDirection: direction };
  }

  // 4. Vertical pitch check (UP / DOWN) using eye-line, noseTip, and mouthCenter
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const noseOffsetRatio = (noseTip.y - eyeMidY) / faceHeight;

  if (mouthCenter) {
    const eyeToNose = noseTip.y - eyeMidY;
    const noseToMouth = mouthCenter.y - noseTip.y;
    const verticalRatio = noseToMouth > 0 ? eyeToNose / noseToMouth : 1;

    if (noseOffsetRatio < 0.14 || verticalRatio < 0.42) {
      return { isLookingAway: true, gazeDirection: "UP" };
    }
    if (noseOffsetRatio > 0.38 || verticalRatio > 1.85) {
      return { isLookingAway: true, gazeDirection: "DOWN" };
    }
  } else {
    if (noseOffsetRatio < 0.14) {
      return { isLookingAway: true, gazeDirection: "UP" };
    }
    if (noseOffsetRatio > 0.38) {
      return { isLookingAway: true, gazeDirection: "DOWN" };
    }
  }

  return { isLookingAway: false, gazeDirection: "CENTER" };
}

/**
 * Computes Laplacian variance (from ViBe BlurDetectorWorker.ts) and average luminance
 * to detect blurry camera feeds or covered/obstructed lenses.
 */
function analyzeImageQuality(imageData: ImageData): {
  isBlurry: boolean;
  blurVariance: number;
  avgBrightness: number;
  cameraCovered: boolean;
} {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  if (pixelCount === 0) {
    return { isBlurry: false, blurVariance: 500, avgBrightness: 128, cameraCovered: false };
  }

  const gray = new Uint8ClampedArray(pixelCount);
  let brightnessSum = 0;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    gray[i] = luma;
    brightnessSum += luma;
  }

  const avgBrightness = brightnessSum / pixelCount;

  // 3x3 Laplacian operator [0, 1, 0; 1, -4, 1; 0, 1, 0]
  const laplacian = new Float32Array(pixelCount);
  let mean = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      const val =
        gray[idx - width] +
        gray[idx - 1] -
        4 * gray[idx] +
        gray[idx + 1] +
        gray[idx + width];
      laplacian[idx] = val;
      mean += val;
      count++;
    }
  }

  if (count > 0) mean /= count;

  let variance = 0;
  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const diff = laplacian[rowOffset + x] - mean;
      variance += diff * diff;
    }
  }
  if (count > 0) variance /= count;

  const cameraCovered = avgBrightness < 18 || (variance < 12 && avgBrightness < 45);
  const isBlurry = !cameraCovered && variance < 85;

  return {
    isBlurry,
    blurVariance: Math.round(variance),
    avgBrightness: Math.round(avgBrightness),
    cameraCovered,
  };
}

async function initializeModel() {
  try {
    await tf.ready();
    let backendSet = false;

    try {
      const ok = await tf.setBackend("webgl");
      if (ok) backendSet = true;
    } catch {
      backendSet = false;
    }

    if (!backendSet) {
      await tf.setBackend("cpu");
    }

    await tf.ready();

    try {
      detector = await faceDetection.createDetector(
        faceDetection.SupportedModels.MediaPipeFaceDetector,
        {
          runtime: "tfjs",
          maxFaces: 10,
          modelType: "full",
        }
      );
    } catch {
      detector = await faceDetection.createDetector(
        faceDetection.SupportedModels.MediaPipeFaceDetector,
        {
          runtime: "tfjs",
          maxFaces: 5,
          modelType: "short",
        }
      );
    }

    self.postMessage({ type: "MODEL_READY", backend: tf.getBackend() });

    // Load COCO-SSD object detector in the background (non-blocking) for phone/book/device detection
    cocoSsd
      .load({ base: "lite_mobilenet_v2" })
      .then((loadedObjDetector) => {
        objectDetector = loadedObjDetector;
        self.postMessage({ type: "OBJECT_MODEL_READY" });
      })
      .catch((err) => {
        console.warn("[faceDetectorWorker] COCO-SSD load warning:", err);
      });
  } catch (err: any) {
    self.postMessage({
      type: "ERROR",
      message: `Model initialization failed: ${err?.message || String(err)}`,
    });
  }
}

async function detectFaces(imageBitmap: ImageBitmap) {
  if (!detector) {
    imageBitmap.close();
    self.postMessage({ type: "ERROR", message: "Model not initialized" });
    return;
  }

  isProcessing = true;
  frameCounter++;
  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      self.postMessage({ type: "ERROR", message: "Canvas context unavailable" });
      return;
    }

    ctx.drawImage(imageBitmap, 0, 0);

    // 1. Run Laplacian Blur & Occlusion check on a fast 160x120 sample
    const sampleW = 160;
    const sampleH = 120;
    const sampleCanvas = new OffscreenCanvas(sampleW, sampleH);
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    let quality = {
      isBlurry: false,
      blurVariance: 500,
      avgBrightness: 128,
      cameraCovered: false,
    };
    if (sampleCtx) {
      sampleCtx.drawImage(imageBitmap, 0, 0, sampleW, sampleH);
      const imgData = sampleCtx.getImageData(0, 0, sampleW, sampleH);
      quality = analyzeImageQuality(imgData);
    }

    // 2. Run MediaPipe Face Detection
    const faces = await detector.estimateFaces(
      canvas as unknown as HTMLCanvasElement
    );

    // 3. Run COCO-SSD Object Detection every 2nd frame (or if an object was recently seen)
    if (objectDetector && (frameCounter % 2 === 0 || cachedObjectState.objectDetected)) {
      try {
        const predictions = await objectDetector.detect(
          canvas as unknown as HTMLCanvasElement,
          10,
          0.32
        );
        const detectedSet = new Set<string>();
        let phoneFound = false;
        let personCount = 0;

        for (const pred of predictions) {
          const cls = pred.class.toLowerCase();
          const score = pred.score;
          if (cls === "person" && score >= 0.48) {
            personCount++;
          } else if (cls === "cell phone" && score >= 0.32) {
            phoneFound = true;
            detectedSet.add("cell phone");
          } else if (cls === "book" && score >= 0.4) {
            detectedSet.add("book");
          } else if (PROHIBITED_OBJECT_CLASSES.has(cls) && score >= 0.45) {
            detectedSet.add(cls);
          }
        }

        const detectedObjects = Array.from(detectedSet);
        cachedObjectState = {
          objectDetected: detectedObjects.length > 0,
          phoneDetected: phoneFound,
          detectedObjects,
          personCount,
          updatedAt: Date.now(),
        };
      } catch {
        // Ignore single-frame object detection glitches
      }
    } else if (Date.now() - cachedObjectState.updatedAt > 2000) {
      cachedObjectState = {
        objectDetected: false,
        phoneDetected: false,
        detectedObjects: [],
        personCount: 0,
        updatedAt: Date.now(),
      };
    }

    const rawFaceCount = faces.length;
    const personBehindDetected =
      rawFaceCount > 1 || cachedObjectState.personCount > 1;
    const faceCount = personBehindDetected
      ? Math.max(rawFaceCount, cachedObjectState.personCount)
      : rawFaceCount;

    let isLookingAway = false;
    let gazeDirection: GazeDirection = "CENTER";

    if (rawFaceCount === 1) {
      const pose = evaluatePoseAndGaze(faces[0]);
      isLookingAway = pose.isLookingAway;
      gazeDirection = pose.gazeDirection;
    }

    // If a clear face is detected, the camera is definitely not covered
    const cameraCovered = faceCount > 0 ? false : quality.cameraCovered;

    self.postMessage({
      type: "DETECTION_RESULT",
      faceCount,
      faceDetected: rawFaceCount > 0,
      personBehindDetected,
      objectDetected: cachedObjectState.objectDetected,
      phoneDetected: cachedObjectState.phoneDetected,
      detectedObjects: cachedObjectState.detectedObjects,
      isLookingAway,
      gazeDirection,
      isBlurry: quality.isBlurry,
      blurVariance: quality.blurVariance,
      avgBrightness: quality.avgBrightness,
      cameraCovered,
      faces,
    });
  } catch (err: any) {
    self.postMessage({
      type: "ERROR",
      message: `Detection failed: ${err?.message || String(err)}`,
    });
  } finally {
    imageBitmap.close();
    isProcessing = false;
  }
}

self.onmessage = async (
  event: MessageEvent<{ type: string; image?: ImageBitmap }>
) => {
  const { type, image } = event.data;
  if (type === "INIT") {
    await initializeModel();
  } else if (type === "DETECT_FACES" && image) {
    if (isProcessing) {
      image.close();
      return;
    }
    await detectFaces(image);
  }
};

export {};
