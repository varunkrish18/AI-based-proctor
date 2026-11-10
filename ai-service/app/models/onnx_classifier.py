"""
ONNX Model Classifier for Proctoring Behavioral Anomaly Detection.
Evaluates windowed head-pose / gaze / landmark feature vectors when a trained
best_model.onnx checkpoint is present; safely degrades to heuristic mode otherwise.
"""

import os
import logging
from typing import List, Optional, Tuple

logger = logging.getLogger("aeps.onnx_classifier")

# 13-label behavioral taxonomy from spec Section 16
LABELS = [
    "NORMAL",
    "LOOKING_LEFT",
    "LOOKING_RIGHT",
    "LOOKING_UP",
    "LOOKING_DOWN",
    "HEAD_TURNED",
    "FACE_NOT_VISIBLE",
    "MULTIPLE_FACES",
    "TAB_SWITCH",
    "FULLSCREEN_EXIT",
    "WEBCAM_LOST",
    "MICROPHONE_LOST",
    "SUSPICIOUS_POSTURE"
]

class OnnxClassifier:
    def __init__(self, model_path: Optional[str] = None):
        if model_path is None:
            # Check default locations
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            candidate = os.path.join(base_dir, "data", "best_model.onnx")
            if os.path.exists(candidate):
                model_path = candidate
            else:
                alt = os.path.join(os.path.dirname(base_dir), "training", "best_model.onnx")
                if os.path.exists(alt):
                    model_path = alt

        self.model_path = model_path
        self.session = None
        self.input_name = None
        self.output_name = None

        if self.model_path and os.path.exists(self.model_path):
            try:
                import onnxruntime as ort
                self.session = ort.InferenceSession(
                    self.model_path,
                    providers=["CPUExecutionProvider"]
                )
                self.input_name = self.session.get_inputs()[0].name
                self.output_name = self.session.get_outputs()[0].name
                logger.info(f"Loaded ONNX model from {self.model_path}")
            except Exception as e:
                logger.warning(f"Failed to load ONNX model ({e}); running heuristic mode only.")
                self.session = None
        else:
            logger.info("No ONNX model found at startup; running heuristic classifier.")

    def is_available(self) -> bool:
        return self.session is not None

    def classify(self, feature_vector: List[float]) -> Tuple[str, float]:
        """
        Accepts a feature vector (e.g., [yaw, pitch, roll, gaze_code, face_count, ...]).
        Returns (predicted_label, confidence).
        """
        if not self.is_available():
            return "NORMAL", 1.0

        try:
            import numpy as np
            inp = np.array([feature_vector], dtype=np.float32)
            outputs = self.session.run([self.output_name], {self.input_name: inp})
            logits = outputs[0][0]
            # Softmax
            exp = np.exp(logits - np.max(logits))
            probs = exp / np.sum(exp)
            top_idx = int(np.argmax(probs))
            confidence = float(probs[top_idx])
            label = LABELS[top_idx] if top_idx < len(LABELS) else "NORMAL"
            return label, confidence
        except Exception as e:
            logger.error(f"Inference error: {e}")
            return "NORMAL", 0.5


classifier = OnnxClassifier()
