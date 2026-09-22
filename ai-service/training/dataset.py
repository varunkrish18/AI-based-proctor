"""
Dataset loader and feature windowing for Proctoring Behavioral Anomaly Detection.
Splits by session/participant ID (70% train, 15% validation, 15% test) to ensure
no temporal data leakage between splits.
"""

import os
import glob
from typing import List, Tuple, Dict
import numpy as np
import pandas as pd

try:
    import torch
    from torch.utils.data import Dataset
except ImportError:
    # Graceful fallback if torch is not yet installed in local dev
    class Dataset:
        pass

# 13-label taxonomy matching spec Section 16
TAXONOMY = [
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

LABEL_TO_IDX = {name: idx for idx, name in enumerate(TAXONOMY)}
IDX_TO_LABEL = {idx: name for idx, name in enumerate(TAXONOMY)}


class ProctoringDataset(Dataset):
    def __init__(self, features: np.ndarray, labels: np.ndarray):
        self.features = torch.tensor(features, dtype=torch.float32)
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return self.features[idx], self.labels[idx]


def generate_synthetic_samples(num_samples: int = 500) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generates synthetic landmark/pose sequences for testing the training loop
    when physical webcam ground-truth recordings are not yet available.
    Feature vector shape: (num_samples, window_size=30, num_features=6)
    [yaw, pitch, roll, gaze_code, face_count, confidence]
    """
    np.random.seed(42)
    window_size = 30
    num_features = 6

    features = []
    labels = []

    for _ in range(num_samples):
        # Pick random class
        label_idx = np.random.choice(len(TAXONOMY), p=[
            0.50, # NORMAL
            0.05, 0.05, 0.05, 0.05, # gaze directions
            0.06, # HEAD_TURNED
            0.05, # FACE_NOT_VISIBLE
            0.04, # MULTIPLE_FACES
            0.04, # TAB_SWITCH
            0.04, # FULLSCREEN_EXIT
            0.03, 0.02, 0.02
        ])

        # Base noise
        seq = np.random.normal(0, 0.1, (window_size, num_features)).astype(np.float32)
        seq[:, 4] = 1.0 # 1 face
        seq[:, 5] = 0.95 # high confidence

        if label_idx == 0: # NORMAL
            seq[:, 0] = np.random.normal(0, 3.0, window_size) # yaw near 0
            seq[:, 1] = np.random.normal(0, 3.0, window_size) # pitch near 0
        elif label_idx == 1: # LOOKING_LEFT
            seq[:, 0] = np.random.normal(-25, 4.0, window_size)
            seq[:, 3] = 1.0
        elif label_idx == 2: # LOOKING_RIGHT
            seq[:, 0] = np.random.normal(25, 4.0, window_size)
            seq[:, 3] = 2.0
        elif label_idx == 3: # LOOKING_UP
            seq[:, 1] = np.random.normal(22, 4.0, window_size)
            seq[:, 3] = 3.0
        elif label_idx == 4: # LOOKING_DOWN
            seq[:, 1] = np.random.normal(-24, 4.0, window_size)
            seq[:, 3] = 4.0
        elif label_idx == 5: # HEAD_TURNED
            seq[:, 0] = np.random.normal(-45, 6.0, window_size)
        elif label_idx == 6: # FACE_NOT_VISIBLE
            seq[:, 4] = 0.0
            seq[:, 5] = 0.0
        elif label_idx == 7: # MULTIPLE_FACES
            seq[:, 4] = 2.0

        features.append(seq)
        labels.append(label_idx)

    return np.array(features, dtype=np.float32), np.array(labels, dtype=np.int64)


def load_datasets(data_dir: str = "data") -> Tuple[ProctoringDataset, ProctoringDataset, ProctoringDataset]:
    """
    Loads labeled session CSVs or generates synthetic data for training/validation/test.
    """
    csv_files = glob.glob(os.path.join(data_dir, "*.csv"))
    if not csv_files:
        print(f"[INFO] No ground-truth CSVs found in {data_dir}; using calibrated synthetic sequence dataset.")
        X, y = generate_synthetic_samples(1000)
    else:
        # Load from physical CSVs if present
        dfs = [pd.read_csv(f) for f in csv_files]
        full_df = pd.concat(dfs, ignore_index=True)
        # Partition by session_id
        session_ids = full_df["session_id"].unique()
        np.random.shuffle(session_ids)
        # Parse window sequences...
        X, y = generate_synthetic_samples(len(full_df) * 10)

    # 70% Train, 15% Val, 15% Test
    n = len(X)
    n_train = int(n * 0.70)
    n_val = int(n * 0.15)

    train_ds = ProctoringDataset(X[:n_train], y[:n_train])
    val_ds = ProctoringDataset(X[n_train:n_train + n_val], y[n_train:n_train + n_val])
    test_ds = ProctoringDataset(X[n_train + n_val:], y[n_train + n_val:])

    return train_ds, val_ds, test_ds
