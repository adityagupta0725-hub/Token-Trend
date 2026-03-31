from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def _norm(value: str) -> str:
    """Normalize column names for fuzzy matching."""
    return re.sub(r"[^a-z0-9]", "", value.lower())


def find_col(columns: pd.Index, candidates: list[str]) -> str | None:
    """Find the first column that matches any of the candidate names."""
    normalized = {_norm(c): c for c in columns}
    for candidate in candidates:
        if candidate in normalized:
            return normalized[candidate]
    return None


def collect_weights(data_dir: Path) -> list[dict[str, float]]:
    """Run logistic regression over each cleaned file and return weights per file."""
    base_features = ["open", "high", "low", "close", "volume"]
    weights_rows: list[dict[str, float]] = []

    for file_path in sorted(data_dir.glob("cleaned_*.csv")):
        df = pd.read_csv(file_path)
        open_col = find_col(df.columns, ["open", "priceopen"])
        high_col = find_col(df.columns, ["high", "pricehigh"])
        low_col = find_col(df.columns, ["low", "pricelow"])
        close_col = find_col(df.columns, ["close", "priceclose"])
        vol_col = find_col(
            df.columns,
            [
                "volume",
                "volumefrom",
                "volumeto",
                "totalvolume",
                "tradevolume",
            ],
        )

        if any(col is None for col in [open_col, high_col, low_col, close_col, vol_col]):
            continue

        data = (
            df[[open_col, high_col, low_col, close_col, vol_col]]
            .copy()
            .apply(pd.to_numeric, errors="coerce")
        )
        data.columns = base_features
        data["next_day_return"] = data["close"].shift(-1) / data["close"] - 1
        data["target_up_next_day"] = (data["next_day_return"] > 0.0233).astype(int)
        data = data.dropna().reset_index(drop=True)

        if len(data) < 20:
            continue

        split_idx = (3 * len(data)) // 5
        X_train = data[base_features].iloc[:split_idx]
        y_train = data["target_up_next_day"].iloc[:split_idx]
        X_test = data[base_features].iloc[split_idx:]
        y_test = data["target_up_next_day"].iloc[split_idx:]

        model = Pipeline(
            [
                ("scaler", StandardScaler()),
                ("clf", LogisticRegression(max_iter=5000, C=10.0, random_state=42)),
            ]
        )
        model.fit(X_train, y_train)

        clf = model.named_steps["clf"]
        coef = clf.coef_.ravel()
        intercept = float(clf.intercept_[0])

        weights = {"file": file_path.name, "intercept": intercept}
        weights.update({f"w_{feature}": float(value) for feature, value in zip(base_features, coef)})
        weights_rows.append(weights)

    return weights_rows


def main() -> None:
    data_dir = Path("DATA")
    if not data_dir.is_dir():
        raise SystemExit("DATA directory not found")

    weights = collect_weights(data_dir)
    data_map = {
        row["file"]: {key: value for key, value in row.items() if key != "file"}
        for row in weights
    }

    data_path = Path("data.json")
    data_path.write_text(json.dumps(data_map, indent=2))
    print(f"Wrote {len(data_map)} entries to {data_path.resolve()}")


if __name__ == "__main__":
    main()
