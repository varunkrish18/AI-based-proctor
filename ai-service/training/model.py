"""
Temporal 1D-CNN Model Architecture for Proctoring Behavior Anomaly Classification.
Takes a window sequence of [batch, sequence_length=30, features=6] and outputs 13 logits.
Exportable directly to ONNX for low-latency CPU inference in FastAPI.
"""

try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None
    nn = None


if nn is not None:
    class ProctoringClassifier(nn.Module):
        def __init__(self, num_features: int = 6, num_classes: int = 13, hidden_dim: int = 64):
            super().__init__()
            # Input shape: (B, C_in, L) -> transpose in forward
            self.conv1 = nn.Conv1d(in_channels=num_features, out_channels=hidden_dim, kernel_size=3, padding=1)
            self.bn1 = nn.BatchNorm1d(hidden_dim)
            self.relu1 = nn.ReLU()
            self.pool1 = nn.MaxPool1d(kernel_size=2)

            self.conv2 = nn.Conv1d(in_channels=hidden_dim, out_channels=hidden_dim * 2, kernel_size=3, padding=1)
            self.bn2 = nn.BatchNorm1d(hidden_dim * 2)
            self.relu2 = nn.ReLU()

            self.global_pool = nn.AdaptiveAvgPool1d(1)
            self.fc = nn.Sequential(
                nn.Linear(hidden_dim * 2, 64),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(64, num_classes)
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            # x can be (B, L, C) or (B, C)
            if x.dim() == 2:
                # Handle single-frame feature vector by expanding
                x = x.unsqueeze(1)
            # Transpose (B, L, C) -> (B, C, L)
            x = x.transpose(1, 2)
            x = self.pool1(self.relu1(self.bn1(self.conv1(x))))
            x = self.relu2(self.bn2(self.conv2(x)))
            x = self.global_pool(x).squeeze(-1)
            return self.fc(x)
else:
    class ProctoringClassifier:
        pass
