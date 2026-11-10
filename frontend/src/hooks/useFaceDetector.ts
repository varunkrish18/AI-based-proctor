import { useEffect, useRef, useState, type RefObject } from "react";
import type { GazeDirection } from "../workers/faceDetectorWorker";

export interface FaceDetectionState {
  ready: boolean;
  faceCount: number | null;
  faceDetected: boolean;
  personBehindDetected: boolean;
  isLookingAway: boolean;
  gazeDirection: GazeDirection;
  isBlurry: boolean;
  blurVariance: number;
  cameraCovered: boolean;
  faces: any[];
  error: string | null;
}

const FRAMES_PER_SECOND = 3.5;

/**
 * React hook running the client-side TensorFlow.js MediaPipe FaceDetector
 * and Laplacian Blur/Occlusion Detector in a Web Worker.
 * Adapted from ViBe (vicharanashala/vibe) use-face-count-detector.ts & useCameraProcessor.ts.
 */
export function useFaceDetector(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean
): FaceDetectionState {
  const [state, setState] = useState<FaceDetectionState>({
    ready: false,
    faceCount: null,
    faceDetected: false,
    personBehindDetected: false,
    isLookingAway: false,
    gazeDirection: "CENTER",
    isBlurry: false,
    blurVariance: 500,
    cameraCovered: false,
    faces: [],
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      readyRef.current = false;
      setState({
        ready: false,
        faceCount: null,
        faceDetected: false,
        personBehindDetected: false,
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

    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/faceDetectorWorker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err?.message || "Web Worker initialization failed",
      }));
      return;
    }

    worker.onmessage = (
      e: MessageEvent<{
        type: string;
        faceCount?: number;
        faceDetected?: boolean;
        personBehindDetected?: boolean;
        isLookingAway?: boolean;
        gazeDirection?: GazeDirection;
        isBlurry?: boolean;
        blurVariance?: number;
        cameraCovered?: boolean;
        faces?: any[];
        message?: string;
      }>
    ) => {
      if (e.data.type === "MODEL_READY") {
        readyRef.current = true;
        setState((prev) => ({ ...prev, ready: true, error: null }));
      } else if (e.data.type === "DETECTION_RESULT") {
        const count = e.data.faceCount ?? 0;
        setState((prev) => ({
          ...prev,
          ready: true,
          faceCount: count,
          faceDetected: e.data.faceDetected ?? count > 0,
          personBehindDetected: e.data.personBehindDetected ?? count > 1,
          isLookingAway: Boolean(e.data.isLookingAway),
          gazeDirection: e.data.gazeDirection || "CENTER",
          isBlurry: Boolean(e.data.isBlurry),
          blurVariance: e.data.blurVariance ?? 500,
          cameraCovered: Boolean(e.data.cameraCovered),
          faces: e.data.faces || [],
          error: null,
        }));
      } else if (e.data.type === "ERROR") {
        setState((prev) => ({
          ...prev,
          error: e.data.message || "Detection error",
        }));
      }
    };

    worker.onerror = (e) => {
      console.warn("[useFaceDetector] Worker error:", e);
      setState((prev) => ({ ...prev, error: "Worker execution error" }));
    };

    worker.postMessage({ type: "INIT" });
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const intervalId = window.setInterval(async () => {
      const video = videoRef.current;
      const worker = workerRef.current;
      if (
        !video ||
        !worker ||
        !ctx ||
        !readyRef.current ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return;
      }

      const targetWidth = Math.min(video.videoWidth, 640);
      const targetHeight = Math.round(
        (targetWidth / video.videoWidth) * video.videoHeight
      );

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      try {
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        const bitmap = await createImageBitmap(canvas);
        worker.postMessage({ type: "DETECT_FACES", image: bitmap }, [bitmap]);
      } catch {
        // Frame not ready this tick — retry on next interval
      }
    }, Math.round(1000 / FRAMES_PER_SECOND));

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, videoRef]);

  return state;
}
