"""
Prepare static JSON data files for the Next.js frontend.

Run once from the repo root:
    python scripts/prepare_static_data.py

Reads from:  backend/data/
Writes to:   frontend/src/data/
"""

import csv
import json
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DATA = REPO_ROOT / "backend" / "data"
FRONTEND_DATA = REPO_ROOT / "frontend" / "src" / "data"

FRONTEND_DATA.mkdir(parents=True, exist_ok=True)


def read_csv(filename: str) -> list[dict]:
    path = BACKEND_DATA / filename
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            # Coerce numeric-looking strings to numbers
            cleaned = {}
            for k, v in row.items():
                # Only coerce strings that look purely numeric (no hex ambiguity).
                # Hex IDs like "614e3103" would be mis-parsed by float() as
                # scientific notation (6.14e3103 = Infinity), producing invalid JSON.
                s = v.strip() if isinstance(v, str) else ""
                if s.lstrip("-").isdigit():
                    cleaned[k] = int(s)
                elif s and "." in s and s.lstrip("-").replace(".", "", 1).isdigit():
                    cleaned[k] = float(s)
                else:
                    cleaned[k] = v
            rows.append(cleaned)
    return rows


def write_json(filename: str, data) -> None:
    path = FRONTEND_DATA / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    size_kb = path.stat().st_size / 1024
    print(f"  wrote {filename}  ({size_kb:.1f} KB)")


def build_contracts():
    print("Building contracts.json...")
    rows = read_csv("contracts.csv")
    result = []
    for r in rows:
        result.append({
            "project_id": r["project_id"],
            "project_name": r["project_name"],
            "original_contract_value": r["original_contract_value"],
            "contract_date": r["contract_date"],
            "substantial_completion_date": r["substantial_completion_date"],
            "gc_name": r["gc_name"],
            "architect": r["architect"],
            "retention_pct": r["retention_pct"],
            "payment_terms": r["payment_terms"],
        })
    write_json("contracts.json", result)
    return result


def build_dossiers_and_portfolio():
    print("Building dossiers.json + portfolio.json...")
    with open(BACKEND_DATA / "dossiers.json", encoding="utf-8") as f:
        raw = json.load(f)

    projects: dict = raw["projects"]

    # Dossier map: keyed by project_id
    dossier_map = {}
    for pid, p in projects.items():
        dossier_map[pid] = p
    write_json("dossiers.json", dossier_map)

    # Portfolio summary
    status_count = {"RED": 0, "YELLOW": 0, "GREEN": 0}
    total_cv = 0.0
    total_at_risk = 0.0
    health_scores = []
    project_summaries = []

    for pid, p in projects.items():
        fin = p.get("financials", {})
        status = p.get("status", "GREEN")
        status_count[status] = status_count.get(status, 0) + 1
        cv = p.get("contract_value", 0)
        total_cv += cv
        if status == "RED":
            erosion_pct = fin.get("margin_erosion_pct", 0)
            total_at_risk += abs(erosion_pct / 100 * cv)

        health_scores.append(p.get("health_score", 0))
        ts = p.get("trigger_summary", {})
        project_summaries.append({
            "project_id": pid,
            "name": p.get("name", ""),
            "contract_value": cv,
            "start_date": p.get("start_date", ""),
            "end_date": p.get("end_date", ""),
            "gc_name": p.get("gc_name", ""),
            "health_score": p.get("health_score", 0),
            "status": status,
            "bid_margin_pct": fin.get("bid_margin_pct", 0),
            "realized_margin_pct": fin.get("realized_margin_pct", 0),
            "margin_erosion_pct": fin.get("margin_erosion_pct", 0),
            "approved_cos": fin.get("approved_cos", 0),
            "pending_cos": fin.get("pending_cos", 0),
            "billing_lag_pct": fin.get("billing_lag_pct", 0),
            "trigger_count": ts.get("total", 0),
            "high_trigger_count": ts.get("high", 0),
        })

    portfolio_health = round(sum(health_scores) / len(health_scores)) if health_scores else 0

    portfolio = {
        "portfolio_health": portfolio_health,
        "total_contract_value": round(total_cv, 2),
        "total_at_risk": round(total_at_risk, 2),
        "project_count": len(projects),
        "at_risk_count": status_count.get("RED", 0),
        "watch_count": status_count.get("YELLOW", 0),
        "healthy_count": status_count.get("GREEN", 0),
        "projects": project_summaries,
    }
    write_json("portfolio.json", portfolio)


def build_csv_json(csv_file: str, json_file: str):
    print(f"Building {json_file}...")
    rows = read_csv(csv_file)
    write_json(json_file, rows)


if __name__ == "__main__":
    print(f"Reading from: {BACKEND_DATA}")
    print(f"Writing to:   {FRONTEND_DATA}\n")

    build_contracts()
    build_dossiers_and_portfolio()
    build_csv_json("field_notes.csv", "field_notes.json")
    build_csv_json("change_orders.csv", "change_orders.json")
    build_csv_json("rfis.csv", "rfis.json")
    build_csv_json("labor_logs.csv", "labor_logs.json")

    print("\nDone! All static data files written to frontend/src/data/")
