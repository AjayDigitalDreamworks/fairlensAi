export type GroupMetric = {
  group: string;
  count: number;
  selection_rate: number;
  true_positive_rate?: number;
  false_positive_rate?: number;
  false_negative_rate?: number;
  accuracy?: number;
};

export type SensitiveFinding = {
  sensitive_column: string;
  baseline_group?: string;
  fairness_score: number;
  risk_level: string;
  demographic_parity_difference: number;
  disparate_impact: number;
  accuracy_spread: number;
  group_metrics: GroupMetric[];
  notes: string[];
  projected_fairness_score?: number;
  projected_disparate_impact?: number;
};

export type Recommendation = {
  category: string;
  priority: string;
  title: string;
  description: string;
};

export type RootCause = {
  type: string;
  sensitive_column: string;
  feature?: string;
  severity: string;
  details: string;
};

export type AnalysisLogEntry = {
  stage: string;
  level?: string;
  status?: "pending" | "running" | "completed" | "complete" | "failed";
  timestamp?: string;
  title?: string;
  detail?: string;
  message?: string;
};

export type ExplainabilitySummary = {
  method?: string;
  status?: string;
  note?: string;
  methods_available?: string[];
  methods_unavailable?: string[];
  shap_style_summary?: Array<{
    feature: string;
    direction: string;
    impact: number;
    summary: string;
  }>;
  lime_style_example?: Array<{
    feature: string;
    direction: string;
    impact: number;
    summary: string;
  }>;
  top_features?: Array<{
    feature: string;
    score?: number;
    weight?: number;
    direction?: string;
    reason?: string;
  }>;
};

export type AnalysisPayload = {
  id: string;
  createdAt: string;
  input: {
    fileName: string;
    domain: string;
    targetColumn?: string;
    predictionColumn?: string;
    sensitiveColumns: string[];
    positiveLabel: string;
  };
  result: {
    metadata: {
      rows: number;
      columns: string[];
      domain: string;
      domain_confidence?: number;
      source_name: string;
      target_column?: string | null;
      prediction_column?: string | null;
      sensitive_columns: string[];
      detection?: {
        target_origin?: string;
        prediction_origin?: string;
        sensitive_origin?: string;
      };
    };
    fairness_summary: {
      overall_fairness_score: number;
      risk_level: string;
      overall_accuracy?: number;
      corrected_fairness_score?: number;
      disparate_impact?: number;
    };
    sensitive_findings: SensitiveFinding[];
    root_causes: RootCause[];
    recommendations: Recommendation[];
    explanation: {
      executive_summary: string;
      plain_language: string[];
    };
    preview_scores_available?: boolean;
    analysis_log?: AnalysisLogEntry[];
    detection?: {
      resolved_domain?: string;
      target_column?: string | null;
      prediction_column?: string | null;
      sensitive_columns?: string[];
      positive_label?: string;
      generated_target?: boolean;
      generated_prediction?: boolean;
      notes?: string[];
    };
    explainability?: ExplainabilitySummary;
    artifacts?: {
      corrected_filename?: string;
      correctedCsvUrl?: string;
      reportPdfUrl?: string;
      before_after?: {
        before_score: number;
        after_score: number;
      };
      corrected_fairness_summary?: {
        overall_fairness_score: number;
        risk_level: string;
      };
      corrected_sensitive_findings?: SensitiveFinding[];
    };
  };
  mitigationPreview?: {
    strategy: string;
    current_score: number;
    projected_score: number;
    projected_improvement: number;
    group_projection: SensitiveFinding[];
    execution_steps: string[];
    operational_notes: string[];
  };
  updatedAt?: string;
};
