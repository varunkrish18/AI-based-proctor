"""
Training Loop & ONNX Exporter for Proctoring Behavioral Anomaly Model.
Trains the 1D-CNN, evaluates on validation split, and exports best checkpoint to ONNX.
"""

import os
import argparse
import numpy as np

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader
    from dataset import load_datasets, TAXONOMY
    from model import ProctoringClassifier
except ImportError:
    torch = None


def train(epochs: int = 15, batch_size: int = 32, lr: float = 0.001, output_dir: str = "."):
    if torch is None:
        print("[ERROR] PyTorch is not installed. Please install training requirements:")
        print("        pip install -r requirements-training.txt")
        return

    print("=== AEPS Proctoring Model Training Pipeline ===")
    train_ds, val_ds, test_ds = load_datasets()
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device} | Train samples: {len(train_ds)} | Val samples: {len(val_ds)}")

    model = ProctoringClassifier(num_features=6, num_classes=len(TAXONOMY)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    best_val_loss = float("inf")
    best_weights_path = os.path.join(output_dir, "best_model.pt")
    onnx_path = os.path.join(output_dir, "best_model.onnx")

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0

        for X_b, y_b in train_loader:
            X_b, y_b = X_b.to(device), y_b.to(device)
            optimizer.zero_grad()
            logits = model(X_b)
            loss = criterion(logits, y_b)
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * len(y_b)
            preds = torch.argmax(logits, dim=-1)
            correct += (preds == y_b).sum().item()
            total += len(y_b)

        train_loss = total_loss / total
        train_acc = (correct / total) * 100.0

        # Validation
        model.eval()
        v_loss = 0.0
        v_correct = 0
        v_total = 0
        with torch.no_grad():
            for X_b, y_b in val_loader:
                X_b, y_b = X_b.to(device), y_b.to(device)
                logits = model(X_b)
                loss = criterion(logits, y_b)
                v_loss += loss.item() * len(y_b)
                preds = torch.argmax(logits, dim=-1)
                v_correct += (preds == y_b).sum().item()
                v_total += len(y_b)

        val_loss = v_loss / v_total
        val_acc = (v_correct / v_total) * 100.0

        print(f"Epoch [{epoch:02d}/{epochs:02d}] "
              f"Train Loss: {train_loss:.4f}, Acc: {train_acc:.1f}% | "
              f"Val Loss: {val_loss:.4f}, Acc: {val_acc:.1f}%")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), best_weights_path)
            # Export to ONNX
            export_onnx(model, onnx_path)

    print(f"\n[DONE] Training complete. Best model exported to: {onnx_path}")


def export_onnx(model, onnx_path: str):
    model.eval()
    dummy_input = torch.randn(1, 30, 6, dtype=torch.float32)
    torch.onnx.export(
        model.cpu(),
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}}
    )
    print(f"       -> Checkpoint saved to {onnx_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--output-dir", type=str, default=".")
    args = parser.parse_args()

    train(epochs=args.epochs, batch_size=args.batch_size, lr=args.lr, output_dir=args.output_dir)
