"""
Evaluation Script for Proctoring Behavioral Anomaly Detection Model.
Computes per-class Precision, Recall, F1 score, and confusion matrix on the held-out test split.
"""

import os
import argparse
import numpy as np

try:
    import torch
    from torch.utils.data import DataLoader
    from dataset import load_datasets, TAXONOMY
    from model import ProctoringClassifier
except ImportError:
    torch = None


def evaluate(model_path: str = "best_model.pt", onnx_path: str = "best_model.onnx"):
    if torch is None:
        print("[ERROR] PyTorch is not installed. Please install requirements-training.txt.")
        return

    _, _, test_ds = load_datasets()
    test_loader = DataLoader(test_ds, batch_size=32, shuffle=False)

    print(f"=== Evaluating on Held-Out Test Set ({len(test_ds)} samples) ===")

    all_preds = []
    all_targets = []

    if os.path.exists(onnx_path):
        print(f"Evaluating via ONNX Runtime: {onnx_path}")
        try:
            import onnxruntime as ort
            sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
            input_name = sess.get_inputs()[0].name
            for X_b, y_b in test_loader:
                outs = sess.run(None, {input_name: X_b.numpy()})[0]
                preds = np.argmax(outs, axis=-1)
                all_preds.extend(preds)
                all_targets.extend(y_b.numpy())
        except Exception as e:
            print(f"ONNX evaluation failed ({e}), falling back to PyTorch.")
            all_preds, all_targets = evaluate_pytorch(model_path, test_loader)
    else:
        all_preds, all_targets = evaluate_pytorch(model_path, test_loader)

    print_metrics(np.array(all_targets), np.array(all_preds))


def evaluate_pytorch(model_path: str, test_loader):
    model = ProctoringClassifier(num_features=6, num_classes=len(TAXONOMY))
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()

    all_preds = []
    all_targets = []
    with torch.no_grad():
        for X_b, y_b in test_loader:
            logits = model(X_b)
            preds = torch.argmax(logits, dim=-1).numpy()
            all_preds.extend(preds)
            all_targets.extend(y_b.numpy())
    return all_preds, all_targets


def print_metrics(targets: np.ndarray, preds: np.ndarray):
    print("\n----------------------------------------------------------------------")
    print(f"{'Class / Behavior':<25} {'Precision':<12} {'Recall':<12} {'F1-Score':<10}")
    print("----------------------------------------------------------------------")

    overall_correct = (targets == preds).sum()
    total = len(targets)

    for idx, name in enumerate(TAXONOMY):
        tp = ((preds == idx) & (targets == idx)).sum()
        fp = ((preds == idx) & (targets != idx)).sum()
        fn = ((preds != idx) & (targets == idx)).sum()

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        print(f"{name:<25} {prec * 100:>8.1f}%   {rec * 100:>8.1f}%   {f1 * 100:>6.1f}%")

    print("----------------------------------------------------------------------")
    print(f"Overall Test Accuracy: {overall_correct / total * 100:.2f}%\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", type=str, default="best_model.pt")
    parser.add_argument("--onnx-path", type=str, default="best_model.onnx")
    args = parser.parse_args()

    evaluate(model_path=args.model_path, onnx_path=args.onnx_path)
