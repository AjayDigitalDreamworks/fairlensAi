# Fairness Score Debugging Guide

## Problem
Your corrected dataset shows:
- **First run**: Fairness score = 92%
- **Second run**: Fairness score = 63%

This 29% drop suggests either data or processing changes between runs.

## Enable Debug Logging

To enable detailed logging, modify your FastAPI main.py or wherever you initialize the ML service:

```python
import logging

# Configure logging to capture debug messages
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s] %(message)s',
    handlers=[
        logging.FileHandler('fairness_debug.log'),  # Also save to file
        logging.StreamHandler()  # Print to console
    ]
)

# Or just for ML service:
ml_logger = logging.getLogger('app')
ml_logger.setLevel(logging.DEBUG)
```

## What Gets Logged

### Data Split Tracking
```
[TRAIN_START] Dataset size: 1000 rows, 15 cols | Target: outcome | Sensitive: ['gender', 'age']
[TARGET_DIST] Positive: 450 (45.0%) | Negative: 550 (55.0%)
[SPLIT_1] Train+Val: 800 | Test: 200 (20%)
[SPLIT_2] Train: 640 | Val: 160 (20.0%) | Validation size calc: 154
```

### Feature Screening
```
[FEATURE_SCREENING] Input: 14 cols → Retained: 11 cols
[FEATURE_SCREENING] Dropped columns: {'all_missing': [], 'constant': ['col1'], 'identifier_like': ['id']}
```

### Sensitive Column Processing
```
[SENSITIVE_COLS] Used columns: ['gender', 'age']
[SENSITIVE_DETAIL] gender: 2 unique values
[SENSITIVE_DETAIL] age: 45 unique values
[SENSITIVE_PREP] age: dtype=int64, unique_count=45
[SENSITIVE_BINNING] age: Age binning (was 45 values → age brackets)
[SENSITIVE_BINNING_RESULT] Groups after binning: ['18-24', '25-29', '30-34', '35-39', '40-49', '50+', 'missing']
```

### Fairness Score Calculation
```
[FAIRNESS_CALC_gender] Groups: 2 | DP_Diff: 0.082000 | EO_Gap: 0.125000 | DI: 0.856000 | AccSpread: 0.045000
[FAIRNESS_SCORE_gender] Score components: DP*40=3.28 + EO*35=4.38 + DI*50=7.20 + AccSp*100=4.50
[FAIRNESS_SCORE_gender] Final score: 80.6400 (confidence: high)

[FAIRNESS_SUMMARY] Individual scores: [85.5, 80.64, 82.1] | Intersectional: True
[FAIRNESS_OVERALL] Overall fairness score: 82.75 (mean of 3 components)
```

## How to Debug the Discrepancy

### 1. Compare Data Splits
- **First run**: Note the exact train/val/test row counts from `[SPLIT_1]` and `[SPLIT_2]`
- **Second run**: Compare these counts
- If they differ, your dataset size or random seed handling may have changed

### 2. Check Sensitive Column Binning
- Look at `[SENSITIVE_BINNING_RESULT]` for age or other numeric sensitive columns
- If binning differs (e.g., different number of age groups), the fairness calculation will differ significantly

### 3. Compare Fairness Components
- Each `[FAIRNESS_CALC_*]` line shows the exact values:
  - `DP_Diff`: Demographic Parity Difference
  - `EO_Gap`: Equalized Odds Gap
  - `DI`: Disparate Impact
  - `AccSpread`: Accuracy Spread

If any of these differ significantly between runs, find out why:
- **DP_Diff changed**: Different selection rates per group
- **EO_Gap changed**: Different TPR/FPR per group
- **DI changed**: Different selection rate ratios
- **AccSpread changed**: Different model accuracy per group

### 4. Check Group Counts
- `Groups: 2` means 2 demographic groups were created
- If this number differs between runs, sensitive column processing is inconsistent

## Key Formula

Your fairness score is calculated as:
```
fairness_score = max(0, 100 - (DP_Diff*40 + EO_Gap*35 + max(0, 0.8-DI)*50 + AccSpread*100))
```

A drop from 92 to 63 = 29 point drop means:
- A combination of metrics got worse
- Example: If EO_Gap increased from 0.1 to 0.7, that's 0.6*35 = 21 points alone

## Save Debug Output

Run both times and save the logs:
```bash
# First run: fairness_debug_run1.log
# Second run: fairness_debug_run2.log

# Then compare:
diff fairness_debug_run1.log fairness_debug_run2.log
```

Look for differences in:
- Dataset size (rows/cols)
- Feature counts
- Sensitive column binning
- Fairness score components
- Group counts

## Common Causes

| Symptom | Likely Cause |
|---------|-------------|
| Different train/val/test splits | Data order changed or random seed not set |
| Different group counts in sensitive columns | Age binning or numeric quantization differences |
| DP_Diff changed significantly | Model predictions different per group |
| EO_Gap changed significantly | Different TPR/FPR per group |
| ACC_Spread changed | Model accuracy varies differently per group |

## Questions to Ask

1. **Is the dataset identical?** Check row count, column order, values
2. **Is data order the same?** Even if identical, row order matters for stratified splits
3. **Are sensitive columns processed the same?** Check if age binning is consistent
4. **Is the model trained the same?** Random seed affects model training
5. **Are predictions the same?** If model differs, predictions differ, fairness scores differ

## Next Steps

1. Enable logging as shown above
2. Run audit on corrected dataset twice
3. Save logs: `fairness_debug_run1.log` and `fairness_debug_run2.log`
4. Compare logs for differences
5. Focus on the first difference found
