#!/usr/bin/env python3
"""
Diagnostic utility for debugging fairness score drops between audit runs.

This script helps you:
1. Run the same dataset through the audit twice
2. Capture detailed logs
3. Compare the results
4. Identify what changed

Usage:
    python debug_fairness.py --csv your_dataset.csv --target outcome --sensitive gender age
"""

import logging
import json
import sys
import hashlib
from pathlib import Path
from datetime import datetime
import argparse
import pandas as pd


def setup_logging(run_num: int, log_dir: str = "./fairness_logs"):
    """Configure detailed logging for audit runs."""
    Path(log_dir).mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = f"{log_dir}/fairness_run{run_num}_{timestamp}.log"
    
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ],
        force=True
    )
    
    return log_file


def hash_dataframe(df: pd.DataFrame) -> str:
    """Generate hash of dataframe contents for integrity checking."""
    content = pd.util.hash_pandas_object(df, index=True).values
    return hashlib.sha256(str(content).encode()).hexdigest()[:16]


def run_audit(df: pd.DataFrame, target_col: str, sensitive_cols: list, run_num: int):
    """Run audit with logging enabled."""
    print(f"\n{'='*60}")
    print(f"RUN {run_num}: Starting Fairness Audit")
    print(f"{'='*60}")
    
    log_file = setup_logging(run_num)
    logger = logging.getLogger(__name__)
    
    # Log dataset metadata
    df_hash = hash_dataframe(df)
    logger.info(f"[DATASET] Rows: {len(df)} | Cols: {len(df.columns)} | Hash: {df_hash}")
    logger.info(f"[DATASET] Columns: {df.columns.tolist()}")
    logger.info(f"[CONFIG] Target: {target_col} | Sensitive: {sensitive_cols}")
    
    # Log data types and missing values
    logger.info("[DATA_TYPES]")
    for col in df.columns:
        missing = df[col].isna().sum()
        logger.info(f"  {col}: {df[col].dtype} | Missing: {missing} ({missing/len(df)*100:.1f}%)")
    
    # Import and run the audit
    from app.core.pipeline import run_audit_pipeline
    
    try:
        result = run_audit_pipeline(
            df=df,
            target_column=target_col,
            sensitive_columns=sensitive_cols,
        )
        
        # Extract key results
        fairness_score = result.get("fairness_summary", {}).get("overall_fairness_score")
        risk_level = result.get("fairness_summary", {}).get("risk_level")
        findings = result.get("fairness_findings", [])
        
        logger.info(f"[RESULTS] Overall Fairness Score: {fairness_score}")
        logger.info(f"[RESULTS] Risk Level: {risk_level}")
        logger.info(f"[RESULTS] Findings count: {len(findings)}")
        
        # Log individual finding scores
        for i, finding in enumerate(findings):
            logger.info(f"[FINDING_{i}] Column: {finding.get('sensitive_column')} | Score: {finding.get('fairness_score')}")
            logger.info(f"[FINDING_{i}] DP_Diff: {finding.get('demographic_parity_difference')} | EO_Gap: {finding.get('equalized_odds_difference')}")
            logger.info(f"[FINDING_{i}] DI: {finding.get('disparate_impact')} | AccSpread: {finding.get('accuracy_spread')}")
        
        print(f"\n✓ Audit completed successfully")
        print(f"  Fairness Score: {fairness_score}")
        print(f"  Risk Level: {risk_level}")
        print(f"  Log saved: {log_file}")
        
        return result, log_file
        
    except Exception as e:
        logger.error(f"[ERROR] Audit failed: {str(e)}", exc_info=True)
        print(f"\n✗ Audit failed: {str(e)}")
        print(f"  Log saved: {log_file}")
        raise


def compare_runs(log1: str, log2: str):
    """Compare two audit runs and highlight differences."""
    print(f"\n{'='*60}")
    print("COMPARISON: Run 1 vs Run 2")
    print(f"{'='*60}\n")
    
    def extract_metrics(log_file):
        metrics = {}
        with open(log_file, 'r') as f:
            for line in f:
                # Extract structured metrics
                if '[RESULTS]' in line:
                    print(f"  {line.strip()}")
                if '[FAIRNESS_SCORE_' in line or '[FAIRNESS_OVERALL]' in line:
                    metrics[line] = line
        return metrics
    
    metrics1 = extract_metrics(log1)
    metrics2 = extract_metrics(log2)
    
    print("\nKey Differences:")
    all_lines = set(metrics1.keys()) | set(metrics2.keys())
    for line in sorted(all_lines):
        val1 = metrics1.get(line, "N/A")
        val2 = metrics2.get(line, "N/A")
        if val1 != val2:
            print(f"  ✗ {line}")
            print(f"      Run 1: {val1}")
            print(f"      Run 2: {val2}")
        else:
            print(f"  ✓ {line}")


def main():
    parser = argparse.ArgumentParser(
        description="Debug fairness score drops between audit runs"
    )
    parser.add_argument(
        "--csv", required=True, help="Path to CSV file with corrected dataset"
    )
    parser.add_argument(
        "--target", required=True, help="Target column name"
    )
    parser.add_argument(
        "--sensitive", nargs="+", required=True, help="Sensitive column names"
    )
    parser.add_argument(
        "--runs", type=int, default=2, help="Number of runs (default: 2)"
    )
    
    args = parser.parse_args()
    
    # Load dataset
    print(f"Loading dataset: {args.csv}")
    df = pd.read_csv(args.csv)
    print(f"✓ Loaded {len(df)} rows, {len(df.columns)} columns")
    
    # Run audits
    results = []
    logs = []
    for i in range(1, args.runs + 1):
        result, log_file = run_audit(df, args.target, args.sensitive, run_num=i)
        results.append(result)
        logs.append(log_file)
    
    # Compare if multiple runs
    if len(logs) > 1:
        compare_runs(logs[0], logs[1])
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for i, result in enumerate(results, 1):
        score = result.get("fairness_summary", {}).get("overall_fairness_score")
        print(f"Run {i}: Fairness Score = {score}")


if __name__ == "__main__":
    main()
