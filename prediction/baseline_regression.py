"""Compare an explainable regression baseline with the current MLP.

All data is synthetic. The target is the next purchase gap in days.
"""

import json
import random
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "feasibility"))

from sequence_model import MLP, dataset  # noqa: E402


def mae(actual, predicted):
    return float(np.mean(np.abs(np.asarray(actual) - np.asarray(predicted))))


class RidgeGapRegressor:
    """Small closed-form ridge regression with standardised inputs."""

    def __init__(self, alpha=1.0):
        self.alpha = alpha
        self.mean = None
        self.scale = None
        self.weights = None

    def fit(self, rows):
        x = np.asarray([row[0] for row in rows], dtype=float)
        y = np.asarray([row[1] for row in rows], dtype=float)
        self.mean = x.mean(axis=0)
        self.scale = x.std(axis=0)
        self.scale[self.scale == 0] = 1.0
        z = (x - self.mean) / self.scale
        design = np.column_stack([np.ones(len(z)), z])
        penalty = np.eye(design.shape[1]) * self.alpha
        penalty[0, 0] = 0.0
        self.weights = np.linalg.solve(design.T @ design + penalty, design.T @ y)
        return self

    def predict(self, rows):
        x = np.asarray([row[0] for row in rows], dtype=float)
        z = (x - self.mean) / self.scale
        design = np.column_stack([np.ones(len(z)), z])
        return design @ self.weights


def evaluate(name, rows, ridge, network):
    actual = [row[1] for row in rows]
    median_predictions = [row[2] for row in rows]
    ridge_predictions = ridge.predict(rows)
    network_predictions = [network.predict_days(row[0]) for row in rows]
    return {
        "world": name,
        "customers": len(rows),
        "medianMaeDays": round(mae(actual, median_predictions), 2),
        "ridgeMaeDays": round(mae(actual, ridge_predictions), 2),
        "mlpMaeDays": round(mae(actual, network_predictions), 2),
    }


def customer_state(predicted_gap, days_since_last, median_gap):
    """Convert a prediction into a business state; consent is checked later."""
    days_until_due = predicted_gap - days_since_last
    if -2 <= days_until_due <= 5:
        return "due_soon"
    if days_since_last > median_gap * 1.4:
        return "lapsed"
    return "stay_quiet"


def main():
    train = dataset("stationary", 900, 19) + dataset("switching", 900, 23)
    ridge = RidgeGapRegressor(alpha=1.0).fit(train)

    network = MLP([len(train[0][0]), 16, 16, 1], random.Random(19))
    network.fit(train, epochs=50, lr=0.15, batch=32, seed=3)

    tests = {
        "stationary": dataset("stationary", 400, 29),
        "switching": dataset("switching", 400, 31),
    }
    results = [evaluate(name, rows, ridge, network) for name, rows in tests.items()]
    example = {
        "predictedGapDays": 28,
        "daysSinceLastPurchase": 25,
        "personalMedianGapDays": 29,
    }
    example["state"] = customer_state(
        example["predictedGapDays"],
        example["daysSinceLastPurchase"],
        example["personalMedianGapDays"],
    )
    print(
        json.dumps(
            {
                "target": "next_purchase_gap_days",
                "modelType": "regression",
                "trainingCustomers": len(train),
                "results": results,
                "exampleDecision": example,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
