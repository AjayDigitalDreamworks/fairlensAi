/**
 * Glossary: maps technical terms → plain-language explanations shown inside ELI5 tooltips.
 * Used by the <ELI5Tooltip> and <TermBadge> components across all pages.
 */

export const glossary: Record<string, { short: string; long: string; example?: string }> = {

  // ── Core Fairness Metrics ──────────────────────────────────────────────────

  "Disparate Impact": {
    short: "Is the AI treating different groups equally?",
    long: "Disparate Impact measures how often the AI approves people from one group vs. another. A ratio of 1.0 means perfect equality. Below 0.8 = the AI is biased (US EEOC 4/5ths rule).",
    example: "If the AI approves 80 out of 100 men but only 50 out of 100 women, the Disparate Impact ratio is 0.625 — illegal under most hiring laws.",
  },

  "Demographic Parity": {
    short: "Equal approval rates across groups?",
    long: "Demographic Parity asks: do different groups receive positive outcomes at the same rate, regardless of their qualifications? A difference close to 0 is good.",
    example: "If 60% of Group A get loans approved but only 40% of Group B, the Demographic Parity Difference is 0.20 — the AI gives Group A a 20% unfair advantage.",
  },

  "Equalized Odds": {
    short: "Does the AI make the same type of errors for everyone?",
    long: "Equalized Odds checks that the AI's correct-prediction rate AND false-alarm rate are the same across groups. If one group gets far more false rejections, that's discrimination.",
    example: "If the AI wrongly rejects 5% of qualified Group A candidates but 20% of qualified Group B candidates, Group B is being unfairly penalized.",
  },

  "DPD": {
    short: "How different are approval rates between groups?",
    long: "DPD stands for Demographic Parity Difference — the gap in positive prediction rates between the most and least advantaged group. Closer to 0 is fairer.",
    example: "DPD of 0.32 means Group A gets approved 32 percentage points more often than Group B for the same task.",
  },

  "EOD": {
    short: "Do qualified people get missed at different rates?",
    long: "EOD (Equal Opportunity Difference) is the gap in True Positive Rates (the rate at which the AI correctly identifies positive cases) across groups.",
    example: "EOD of 0.18 means the AI correctly identifies 18% fewer qualified candidates from Group B vs Group A.",
  },

  "Fairness Score": {
    short: "An overall 0–100 score for how fair the AI is.",
    long: "The Fairness Score combines all the bias metrics into a single number. 100 = perfectly fair. Below 80 = concerning. Our target is 95+.",
    example: "A score of 72% means the AI has significant fairness gaps that must be addressed before deployment.",
  },

  "Corrected Fairness": {
    short: "Fairness after the AI has been fixed.",
    long: "After running bias correction algorithms, the AI's decisions are re-evaluated. The Corrected Fairness score shows how much fairer the AI became after the fix.",
    example: "Original: 68% → Corrected: 91%. The bias correction improved fairness by 23 percentage points.",
  },

  // ── Model Performance Metrics ──────────────────────────────────────────────

  "True Positive Rate": {
    short: "How often does the AI correctly say 'yes'?",
    long: "TPR (also called Recall or Sensitivity) measures how often the AI correctly identifies positive cases. High TPR = fewer missed positives.",
    example: "TPR of 0.85 means the AI correctly approves 85% of actually-qualified candidates.",
  },

  "False Positive Rate": {
    short: "How often does the AI incorrectly say 'yes'?",
    long: "FPR measures how often the AI approves cases that shouldn't have been approved. A high FPR means many 'false alarms'.",
    example: "FPR of 0.12 means 12% of unqualified candidates are incorrectly approved by the AI.",
  },

  "False Negative Rate": {
    short: "How often does the AI incorrectly say 'no'?",
    long: "FNR measures how often qualified candidates are wrongly rejected. High FNR = many missed opportunities.",
    example: "FNR of 0.20 means 20% of actually-qualified candidates are wrongly rejected.",
  },

  "Selection Rate": {
    short: "What percentage of people get approved?",
    long: "The Selection Rate is the proportion of people from a group who receive a positive outcome from the AI (e.g., loan approved, job offered).",
    example: "A selection rate of 0.45 means 45% of applicants from that group were approved.",
  },

  "Accuracy": {
    short: "How often is the AI simply correct?",
    long: "Accuracy is the percentage of all predictions (both 'yes' and 'no') where the AI got the right answer. High accuracy doesn't guarantee fairness.",
    example: "92% accuracy means the AI was correct 92 times out of 100 — but it may still be unfair to minority groups.",
  },

  // ── Bias Mitigation Strategies ─────────────────────────────────────────────

  "Reweighing": {
    short: "Adjusting how much the AI values each data point.",
    long: "Reweighing assigns different importance (weights) to training examples so that underrepresented groups matter more to the AI during learning. Like giving bonus points to correct for historical disadvantage.",
    example: "If women are 30% of the training data but 50% of real applicants, reweighing gives each woman's example extra importance so the AI learns correctly.",
  },

  "Threshold Optimization": {
    short: "Setting a different pass/fail cutoff for fairness.",
    long: "Instead of one cutoff score for everyone, Threshold Optimization finds the best per-group cut-off to equalize outcomes. It changes who 'passes', not the AI's reasoning.",
    example: "Group A needs a score of 70+ to be approved. Group B, historically disadvantaged, needs 60+ so both groups have equal approval rates.",
  },

  "Adversarial Debiasing": {
    short: "Training the AI to be ignorant of protected attributes.",
    long: "This trains two AIs simultaneously: one predicting outcomes, one trying to detect which group a person belongs to. The first AI learns to be so balanced that the second can't tell groups apart.",
    example: "If the AI can't predict whether a candidate is male or female just from its decision, it can't be biased based on gender.",
  },

  "Strategic Resampling": {
    short: "Balancing the training data by adjusting group sizes.",
    long: "Resampling creates a fairer training dataset by adding more examples from underrepresented groups (oversampling) or removing some from overrepresented groups (undersampling).",
    example: "If only 10% of training data has women, resampling duplicates women's examples until they're 50% — giving the AI equal exposure.",
  },

  // ── SHAP / Explainability ──────────────────────────────────────────────────

  "SHAP": {
    short: "Which factors pushed the AI toward its decision?",
    long: "SHAP (SHapley Additive exPlanations) breaks down the AI's decision into contributions from each feature. Positive SHAP = pushed toward approval. Negative SHAP = pushed toward rejection.",
    example: "For a loan application, SHAP might show: income +0.4, credit score +0.3, zip code -0.2 (that -0.2 for zip code is suspicious — it may encode race).",
  },

  "Feature Importance": {
    short: "Which inputs mattered most to the AI?",
    long: "Feature Importance ranks all the input variables by how much they influenced the AI's predictions overall. Higher importance = the AI relied on it more.",
    example: "If 'age' has importance 0.35 and 'education' has 0.05, the AI uses age 7× more than education to make decisions.",
  },

  "Proxy Feature": {
    short: "A hidden stand-in for a protected attribute.",
    long: "A Proxy Feature is an innocent-looking variable that secretly encodes information about race, gender, or other protected attributes. Using it causes indirect discrimination.",
    example: "Zip code can be a proxy for race in cities with residential segregation. Using zip code in loan decisions can discriminate even if race is not in the data.",
  },

  // ── Risk & Compliance ──────────────────────────────────────────────────────

  "Risk Level": {
    short: "How urgent is the fairness problem?",
    long: "Risk Level (Low / Medium / High) summarizes how seriously biased the AI is. High risk = legal exposure and immediate action required.",
    example: "High risk means the AI's bias metrics violate regulatory thresholds (e.g., EEOC, EU AI Act) and it should NOT be deployed.",
  },

  "Compliance Gap": {
    short: "How far from the compliance target are we?",
    long: "The Compliance Gap is the number of fairness points needed to reach the required target (usually 95+). 0 gap = the AI meets compliance standards.",
    example: "Corrected score of 87%, target of 95% → Compliance Gap = 8 points. Further mitigation is required.",
  },

  "Baseline Group": {
    short: "The group used as the reference point for comparisons.",
    long: "The Baseline Group is the group the AI compares all others against when measuring fairness. Usually the historically advantaged group (e.g., White, Male).",
    example: "If White applicants are the baseline, DPD measures how much less often African-American applicants are approved compared to White applicants.",
  },

  "Audit": {
    short: "A fairness check of your AI system.",
    long: "An Audit runs a complete analysis of your AI to measure bias, generate fairness metrics, and produce corrected outputs. Like a financial audit, but for discrimination.",
    example: "After running an audit on a hiring AI, FairLens found a 0.62 Disparate Impact ratio for gender — below the legal threshold of 0.80.",
  },

  "Sensitive Attribute": {
    short: "A feature the AI should not discriminate on.",
    long: "Sensitive Attributes are personal characteristics protected by law: race, gender, age, disability, religion, national origin. The AI must not treat people differently because of them.",
    example: "If 'gender' is a sensitive attribute and the AI approves men at 80% but women at 50%, it's discriminating on a protected attribute.",
  },

  "Mitigation": {
    short: "Fixing the AI's bias problem.",
    long: "Mitigation refers to mathematical techniques applied to the AI (or its training data) to reduce bias. Different strategies work better in different situations.",
    example: "Applying Threshold Optimization reduced the Demographic Parity Difference from 0.28 to 0.06 — a 79% reduction in bias.",
  },

  // ── Additional Terms ───────────────────────────────────────────────────────

  "Explainability": {
    short: "Understanding why the AI made a decision.",
    long: "Explainability (or Interpretability) reveals which input features most influenced the AI's prediction. This helps detect if the AI is relying on inappropriate factors like race or gender.",
    example: "An explainability analysis shows that 'zip code' is the #1 driver of loan decisions — but zip code is a proxy for race in segregated cities.",
  },

  "Before/After Correction": {
    short: "Comparing fairness before and after a fix.",
    long: "Before/After Correction charts show the AI's fairness scores before bias mitigation was applied (the 'before') and the improved scores after the fix (the 'after'). The goal is for the 'after' bars to reach 80%+ fairness.",
    example: "Before correction: 62% fairness. After applying Threshold Optimization: 94% fairness — a 32-point improvement.",
  },

  "Model Wrapper": {
    short: "A fairness layer added on top of the AI.",
    long: "A Model Wrapper intercepts the AI's predictions and adjusts them to be fairer, without changing the original model. It acts like a fairness filter between the AI and the final decision.",
    example: "The ThresholdOptimizer wrapper adjusts the cutoff scores per group so that approval rates become equal across demographics.",
  },

  "Confusion Matrix": {
    short: "A table showing where the AI gets it right and wrong.",
    long: "A Confusion Matrix breaks down predictions into four categories: True Positives (correctly approved), True Negatives (correctly rejected), False Positives (wrongly approved), and False Negatives (wrongly rejected).",
    example: "The confusion matrix shows the AI correctly approves 85 qualified candidates but wrongly rejects 15 — those 15 are False Negatives.",
  },

  "F1 Score": {
    short: "A balanced measure of the AI's precision and recall.",
    long: "F1 Score combines precision (how many 'yes' predictions were correct) and recall (how many actual 'yes' cases were found). A perfect F1 is 1.0. It's useful when classes are imbalanced.",
    example: "F1 of 0.78 means the AI has a reasonable balance between not missing positive cases and not making too many false positive predictions.",
  },

  "Accuracy Spread": {
    short: "Difference in accuracy between groups.",
    long: "Accuracy Spread measures the gap in the AI's overall correctness between different demographic groups. A high spread means the AI works well for one group but performs poorly for another.",
    example: "If the AI is 95% accurate for men but only 80% accurate for women, the Accuracy Spread is 15%.",
  },

  "Parity Stability": {
    short: "How consistent is the fairness across subsets?",
    long: "Parity Stability indicates how reliably the demographic parity holds up across different segments or samples of the data. High stability means fairness is robust, not a fluke.",
  },

  "Bootstrap Confidence Interval": {
    short: "A statistical range of certainty.",
    long: "A Bootstrap Confidence Interval estimates the true score by repeatedly sampling the data. It tells us how much we can trust the fairness score, rather than relying on a single snapshot.",
    example: "A fairness score of 85% with a 95% confidence interval of [82%, 88%] means we are very confident the true fairness is between 82 and 88.",
  },

  "Keras Model": {
    short: "A type of deep learning AI model.",
    long: "Keras is a popular framework for building neural networks and deep learning models. These models are complex and often harder to audit for bias than simpler machine learning models.",
  },

  "LIME": {
    short: "Local Interpretable Model-agnostic Explanations.",
    long: "LIME is a technique used to explain individual predictions of complex AI models by approximating them locally with a simpler, interpretable model.",
    example: "LIME can show exactly why candidate X was rejected by highlighting which specific words in their resume influenced the deep learning algorithm.",
  },

};

/**
 * Returns the glossary entry for a term, or null if not found.
 * Case-insensitive lookup with fuzzy matching.
 */
export function lookupTerm(term: string): { short: string; long: string; example?: string } | null {
  const normalized = term.trim();
  // Direct match
  if (glossary[normalized]) return glossary[normalized];
  // Case-insensitive match
  const key = Object.keys(glossary).find((k) => k.toLowerCase() === normalized.toLowerCase());
  return key ? glossary[key] : null;
}
