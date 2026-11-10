import { useEffect, useRef, useState, type RefObject } from "react";
import {
  FilesetResolver,
  FaceDetector,
  ObjectDetector,
} from "@mediapipe/tasks-vision";
import type { GazeDirection, Keypoint } from "../workers/faceDetectorWorker";

export interface FaceDetectionState {
  ready: boolean;
  objectModelReady: boolean;
  faceCount: number | null;
  faceDetected: boolean;
  personBehindDetected: boolean;
  objectDetected: boolean;
  phoneDetected: boolean;
  detectedObjects: string[];
  isLookingAway: boolean;
  gazeDirection: GazeDirection;
  isBlurry: boolean;
  blurVariance: number;
  cameraCovered: boolean;
  faces: any[];
  error: string | null;
}

const TICK_INTERVAL_MS = 300; // ~3.3 FPS

// Module-level cached MediaPipe Vision detectors so models stay warm across SystemCheck & ExamTake
let sharedFaceDetector: FaceDetector | null = null;
let sharedObjectDetector: ObjectDetector | null = null;
let sharedInitPromise: Promise<void> | null = null;

async function ensureVisionDetectors(): Promise<void> {
  if (sharedFaceDetector && sharedObjectDetector) {
    return;
  }
  if (sharedInitPromise) {
    return sharedInitPromise;
  }

  sharedInitPromise = (async () => {
    let vision: any;
    try {
      vision = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
    } catch {
      vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm"
      );
    }

    if (!sharedFaceDetector) {
      try {
        sharedFaceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "/mediapipe-models/blaze_face_short_range.tflite",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.55,
        });
      } catch {
        sharedFaceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.55,
        });
      }
      console.warn("[EdgeCV] ✅ MediaPipe BlazeFace Detector Ready");
    }

    if (!sharedObjectDetector) {
      try {
        sharedObjectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "/mediapipe-models/efficientdet_lite0.tflite",
          },
          runningMode: "IMAGE",
          scoreThreshold: 0.32,
          maxResults: 8,
        });
      } catch {
        sharedObjectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
          },
          runningMode: "IMAGE",
          scoreThreshold: 0.32,
          maxResults: 8,
        });
      }
      console.warn(
        "[EdgeCV] ✅ MediaPipe EfficientDet-Lite0 Detector Ready"
      );
    }
  })();

  try {
    await sharedInitPromise;
  } catch (err) {
    sharedInitPromise = null;
    throw err;
  }
}

/**
 * Geometric heuristic from ViBe (FaceDetectors.tsx) to detect looking away / head turned,
 * augmented with directional classification (LEFT, RIGHT, UP, DOWN, CENTER).
 */
function evaluatePoseAndGaze(face: {
  keypoints: Keypoint[];
  box: { xMin: number; yMin: number; width: number; height: number };
}): { isLookingAway: boolean; gazeDirection: GazeDirection } {
  if (!face || !face.keypoints || face.keypoints.length < 4 || !face.box) {
    return { isLookingAway: false, gazeDirection: "CENTER" };
  }

  const rightEye = face.keypoints.find((p) => p.name === "rightEye");
  const leftEye = face.keypoints.find((p) => p.name === "leftEye");
  const noseTip = face.keypoints.find((p) => p.name === "noseTip");
  const mouthCenter = face.keypoints.find((p) => p.name === "mouthCenter");
  const rightEar = face.keypoints.find((p) => p.name === "rightEarTragion");
  const leftEar = face.keypoints.find((p) => p.name === "leftEarTragion");

  if (!rightEye || !leftEye || !noseTip) {
    return { isLookingAway: false, gazeDirection: "CENTER" };
  }

  const faceWidth = Math.max(1, face.box.width || 1);
  const faceHeight = Math.max(1, face.box.height || 1);

  // 1. ViBe Eye distance ratio
  const eyeDistance =
    (Math.abs(leftEye.x - rightEye.x) / faceWidth / Math.pow(faceHeight, 0.1)) *
    1.7;

  // 2. ViBe Nose-to-eye symmetry ratio (horizontal yaw detection)
  const noseToLeftEye = Math.abs(noseTip.x - leftEye.x);
  const noseToRightEye = Math.abs(noseTip.x - rightEye.x);
  const maxNoseDist = Math.max(noseToLeftEye, noseToRightEye) || 1;
  const minNoseDist = Math.min(noseToLeftEye, noseToRightEye);
  const noseRatio =
    (minNoseDist / maxNoseDist) *
    (Math.pow(faceHeight, 0.2) / Math.pow(200, 0.2));

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

  const isYawAway =
    eyeDistance < 0.35 || noseRatio < 0.47 || earVisibilityRatio < 0.47;

  if (isYawAway) {
    const direction: GazeDirection =
      noseToRightEye < noseToLeftEye ? "RIGHT" : "LEFT";
    return { isLookingAway: true, gazeDirection: direction };
  }

  // 4. Vertical pitch check (UP / DOWN)
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
 * Detects whether an opaque non-skin object (such as the back of a smartphone)
 * is being held directly over the candidate's eyes/upper face while the lower face is visible.
 */
function checkEyeRegionOccludedByObject(
  imgData: ImageData,
  face: {
    keypoints: Keypoint[];
    box: { xMin: number; yMin: number; width: number; height: number };
  }
): boolean {
  const rightEye = face.keypoints.find((p) => p.name === "rightEye");
  const leftEye = face.keypoints.find((p) => p.name === "leftEye");
  const noseTip = face.keypoints.find((p) => p.name === "noseTip");
  const mouthCenter = face.keypoints.find((p) => p.name === "mouthCenter");
  if (!rightEye || !leftEye || !noseTip || !mouthCenter) return false;

  const { width, height, data } = imgData;
  const minX = Math.max(0, Math.floor(Math.min(rightEye.x, leftEye.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(rightEye.x, leftEye.x)));
  if (maxX - minX < 14) return false;

  const eyeY = Math.round((rightEye.y + leftEye.y) / 2);
  const bandTop = Math.max(0, Math.floor(eyeY - face.box.height * 0.08));
  const bandBottom = Math.min(
    height - 1,
    Math.ceil((eyeY + noseTip.y) / 2)
  );
  if (bandBottom <= bandTop) return false;

  // Sample eye-bridge band chromaticity (R - B)
  let eyeRbSum = 0;
  let eyeNonSkinCount = 0;
  let eyeSamples = 0;

  for (let y = bandTop; y <= bandBottom; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const b = data[idx + 2];
      const rb = r - b;
      eyeRbSum += rb;
      if (rb <= 6) {
        eyeNonSkinCount++;
      }
      eyeSamples++;
    }
  }

  // Sample lower face (around mouthCenter / chin) chromaticity (R - B)
  const mouthYTop = Math.max(0, Math.floor((noseTip.y + mouthCenter.y) / 2));
  const mouthYBot = Math.min(
    height - 1,
    Math.ceil(mouthCenter.y + face.box.height * 0.12)
  );
  let lowerRbSum = 0;
  let lowerSamples = 0;

  for (let y = mouthYTop; y <= mouthYBot; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const b = data[idx + 2];
      lowerRbSum += r - b;
      lowerSamples++;
    }
  }

  if (eyeSamples < 10 || lowerSamples < 10) return false;

  const avgEyeRb = eyeRbSum / eyeSamples;
  const avgLowerRb = lowerRbSum / lowerSamples;
  const nonSkinFraction = eyeNonSkinCount / eyeSamples;

  // If the lower face has warm skin tone (avgLowerRb >= 14) while the eye band is covered
  // by a cool/metallic/grey/blue phone back (nonSkinFraction > 0.72 and avgLowerRb - avgEyeRb >= 18)
  return (
    avgLowerRb >= 14 &&
    nonSkinFraction > 0.72 &&
    avgLowerRb - avgEyeRb >= 18
  );
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
    return {
      isBlurry: false,
      blurVariance: 500,
      avgBrightness: 128,
      cameraCovered: false,
    };
  }

  const gray = new Uint8ClampedArray(pixelCount);
  let brightnessSum = 0;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const luma =
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    gray[i] = luma;
    brightnessSum += luma;
  }

  const avgBrightness = brightnessSum / pixelCount;

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

  const cameraCovered =
    avgBrightness < 18 || (variance < 12 && avgBrightness < 45);
  const isBlurry = !cameraCovered && variance < 85;

  return {
    isBlurry,
    blurVariance: Math.round(variance),
    avgBrightness: Math.round(avgBrightness),
    cameraCovered,
  };
}

/**
 * Finds the best playing HTMLVideoElement on the page (either videoRef.current or any visible webcam preview).
 */
function resolveActiveVideoElement(
  videoRef: RefObject<HTMLVideoElement | null>
): HTMLVideoElement | null {
  const primary = videoRef.current;
  if (
    primary &&
    primary.readyState >= 2 &&
    primary.videoWidth > 0 &&
    primary.videoHeight > 0 &&
    !primary.paused
  ) {
    return primary;
  }

  // Fallback to any active video element rendered in the document (e.g. pipVideoRef in ExamTake)
  const videos = document.querySelectorAll("video");
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
      if (v.paused) {
        v.play().catch(() => {});
      }
      return v;
    }
  }

  if (primary && primary.srcObject && primary.paused) {
    primary.play().catch(() => {});
  }
  return null;
}

const KEYPOINT_NAMES = [
  "rightEye",
  "leftEye",
  "noseTip",
  "mouthCenter",
  "rightEarTragion",
  "leftEarTragion",
];

export function useFaceDetector(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean
): FaceDetectionState {
  const [state, setState] = useState<FaceDetectionState>({
    ready: Boolean(sharedFaceDetector),
    objectModelReady: Boolean(sharedObjectDetector),
    faceCount: null,
    faceDetected: false,
    personBehindDetected: false,
    objectDetected: false,
    phoneDetected: false,
    detectedObjects: [],
    isLookingAway: false,
    gazeDirection: "CENTER",
    isBlurry: false,
    blurVariance: 500,
    cameraCovered: false,
    faces: [],
    error: null,
  });

  const lastLogTimeRef = useRef<number>(0);
  const consecutiveEyeOcclusionRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setState({
        ready: false,
        objectModelReady: false,
        faceCount: null,
        faceDetected: false,
        personBehindDetected: false,
        objectDetected: false,
        phoneDetected: false,
        detectedObjects: [],
        isLookingAway: false,
        gazeDirection: "CENTER",
        isBlurry: false,
        blurVariance: 500,
        cameraCovered: false,
        faces: [],
        error: null,
      });
      return;
    }

    let cancelled = false;
    let isTickRunning = false;

    ensureVisionDetectors()
      .then(() => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          ready: true,
          objectModelReady: Boolean(sharedObjectDetector),
          error: null,
        }));
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.warn("[EdgeCV] Model initialization error:", err);
        setState((prev) => ({
          ...prev,
          error: err?.message || "Failed to initialize Edge CV models",
        }));
      });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const intervalId = window.setInterval(() => {
      if (cancelled || isTickRunning || !sharedFaceDetector || !ctx) {
        return;
      }

      const video = resolveActiveVideoElement(videoRef);
      if (!video) {
        return;
      }

      isTickRunning = true;
      try {
        const targetW = 320;
        const targetH = Math.max(
          180,
          Math.round((targetW / video.videoWidth) * video.videoHeight)
        );
        canvas.width = targetW;
        canvas.height = targetH;

        ctx.drawImage(video, 0, 0, targetW, targetH);
        const imgData = ctx.getImageData(0, 0, targetW, targetH);

        // 1. Laplacian Blur & Camera Occlusion check
        const quality = analyzeImageQuality(imgData);

        // 2. MediaPipe BlazeFace Detection
        const faceRes = sharedFaceDetector.detect(canvas);
        const rawDetections = faceRes?.detections || [];

        const normalizedFaces = rawDetections.map((d) => {
          const bb = d.boundingBox || {
            originX: 0,
            originY: 0,
            width: targetW,
            height: targetH,
          };
          const kps: Keypoint[] = (d.keypoints || []).map((kp, idx) => ({
            x: kp.x * targetW,
            y: kp.y * targetH,
            name: KEYPOINT_NAMES[idx] || kp.label,
          }));
          return {
            box: {
              xMin: bb.originX,
              yMin: bb.originY,
              xMax: bb.originX + bb.width,
              yMax: bb.originY + bb.height,
              width: bb.width,
              height: bb.height,
            },
            keypoints: kps,
            score: d.categories?.[0]?.score ?? 0.8,
          };
        });

        // 3. MediaPipe EfficientDet-Lite0 Anomaly & Phone Detection
        let anomalyDetected = false;
        let personCount = 0;

        if (sharedObjectDetector) {
          const objRes = sharedObjectDetector.detect(canvas);
          const objDetections = objRes?.detections || [];

          for (const det of objDetections) {
            const cat = det.categories?.[0];
            if (!cat) continue;
            const cls = (cat.categoryName || "").toLowerCase().trim();
            const score = cat.score ?? 0;

            if (cls === "person" && score >= 0.45) {
              personCount++;
            } else if (cls === "cell phone" && score >= 0.28) {
              anomalyDetected = true;
            } else if (cls === "remote" && score >= 0.32) {
              // Back / camera module of phone held horizontally
              anomalyDetected = true;
            } else if (cls === "book" && score >= 0.38) {
              anomalyDetected = true;
            }
          }
        }

        // 4. Eye-Bridge Occlusion Check (detects phone or device held directly over eyes/face)
        if (normalizedFaces.length === 1 && !anomalyDetected) {
          const isEyeOccluded = checkEyeRegionOccludedByObject(
            imgData,
            normalizedFaces[0]
          );
          if (isEyeOccluded) {
            consecutiveEyeOcclusionRef.current++;
            if (consecutiveEyeOcclusionRef.current >= 2) {
              anomalyDetected = true;
            }
          } else {
            consecutiveEyeOcclusionRef.current = 0;
          }
        } else if (normalizedFaces.length === 0) {
          consecutiveEyeOcclusionRef.current = 0;
        }

        const detectedObjects = anomalyDetected ? ["anomaly"] : [];

        // If eyes are occluded by a phone held in front of the face, do not report a clean face
        const rawFaceCount = normalizedFaces.length;
        const personBehindDetected =
          rawFaceCount > 1 || personCount > 1;
        const faceCount = personBehindDetected
          ? Math.max(rawFaceCount, personCount)
          : rawFaceCount;

        let isLookingAway = false;
        let gazeDirection: GazeDirection = "CENTER";

        if (rawFaceCount === 1) {
          const pose = evaluatePoseAndGaze(normalizedFaces[0]);
          isLookingAway = pose.isLookingAway;
          gazeDirection = pose.gazeDirection;
        }

        const cameraCovered = faceCount > 0 ? false : quality.cameraCovered;

        const now = Date.now();
        if (now - lastLogTimeRef.current >= 2500) {
          if (anomalyDetected) {
            lastLogTimeRef.current = now;
            console.warn("[EdgeCV] 🚨 Anomaly Detected in camera frame");
          } else if (personBehindDetected) {
            lastLogTimeRef.current = now;
            console.warn(
              `[EdgeCV] 👥 Multiple People Detected (count: ${faceCount})`
            );
          } else if (rawFaceCount === 0 && !cameraCovered) {
            lastLogTimeRef.current = now;
            console.warn("[EdgeCV] ⚠️ No face detected in camera frame");
          } else if (isLookingAway) {
            lastLogTimeRef.current = now;
            console.warn(`[EdgeCV] 👀 Candidate looking ${gazeDirection}`);
          }
        }

        setState({
          ready: true,
          objectModelReady: Boolean(sharedObjectDetector),
          faceCount,
          faceDetected: rawFaceCount > 0,
          personBehindDetected,
          objectDetected: anomalyDetected,
          phoneDetected: anomalyDetected,
          detectedObjects,
          isLookingAway,
          gazeDirection,
          isBlurry: quality.isBlurry,
          blurVariance: quality.blurVariance,
          cameraCovered,
          faces: normalizedFaces,
          error: null,
        });
      } catch (err: any) {
        console.warn("[EdgeCV] Frame detection error:", err);
      } finally {
        isTickRunning = false;
      }
    }, TICK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, videoRef]);

  return state;
}
