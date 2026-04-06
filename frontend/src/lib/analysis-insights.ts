import type { AnalysisPayload, SensitiveFinding } from "@/types/analysis";

export type QuickStatItem = {
  label: string;
  value: string;
  change: string;
};

export type AuditLogItem = {
  id: string;
  name: string;
  date: string;
  biasScore: number;
  status: "completed";
  type: string;
};

export type RadarTrendPoint = {
  subject: string;
  baseline: number;
  corrected: number;
  fullMark: number;
};

export type BiasDistributionPoint = {
  name: string;
  range: string;
  value: number;
};

export type TrendSeries = {
  key: string;
  label: string;
  color: string;
  strokeWidth: number;
  dotRadius: number;
  dashArray?: string;
};

export type TrendPoint = {
  name: string;
  [key: string]: string | number | null;
};

export type PerformanceTrend = {
  data: TrendPoint[];
  series: TrendSeries[];
  description: string;
};

type GroupAggregate = {
  total: number;
  count: number;
};

type MonthBucket = {
  date: Date;
  groups: Map<string, GroupAggregate>;
  originalFairnessTotal: number;
  correctedFairnessTotal: number;
  count: number;
};

const linePalette = [
  { color: "var(--chart-primary)", strokeWidth: 4, dotRadius: 4 },
  { color: "var(--chart-secondary)", strokeWidth: 3, dotRadius: 3 },
  { color: "var(--chart-accent)", strokeWidth: 2, dotRadius: 2, dashArray: "5 5" },
];

export function getCorrectedScore(report: AnalysisPayload) {
  return (
    report.result?.artifacts?.corrected_fairness_summary?.overall_fairness_score ??
    report.result?.fairness_summary?.corrected_fairness_score ??
    null
  );
}

export function getCorrectedSensitiveFindings(report: AnalysisPayload): SensitiveFinding[] {
  return report.result?.artifacts?.corrected_sensitive_findings ?? report.result?.corrected_sensitive_findings ?? [];
}

export function getFindingGroupMetrics(finding: SensitiveFinding) {
  return Array.isArray(finding.group_metrics) ? finding.group_metrics : [];
}

export function getBiasSignal(report: AnalysisPayload) {
  return Math.max(0, 100 - (report.result?.fairness_summary?.overall_fairness_score ?? 100));
}

export function isTargetMet(report: AnalysisPayload) {
  const target = report.result?.fairness_summary?.fairness_target ?? 95;
  const correctedScore = getCorrectedScore(report);
  return typeof correctedScore === "number"
    ? correctedScore >= target
    : (report.result?.fairness_summary?.overall_fairness_score ?? 0) >= target;
}

export function getProtocolType(report: AnalysisPayload) {
  if (report.mitigationPreview) return "Mitigation Toolkit";
  if (isTargetMet(report)) return "Compliance Release";
  if (report.result?.metadata?.prediction_column) return "Model Evaluation";
  return "Dataset Analyzer";
}

export function formatMetric(value: number, decimals = value >= 10 ? 0 : value >= 1 ? 1 : 2) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(decimals);
}

export function formatRelativeTime(value: string) {
  const createdAt = new Date(value);
  const diffMs = Date.now() - createdAt.getTime();

  if (Number.isNaN(createdAt.getTime()) || diffMs < 0) {
    return "unknown";
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function buildQuickStats(analyses: AnalysisPayload[]): QuickStatItem[] {
  const now = new Date();
  const monthlyCount = analyses.filter((report) => {
    const created = new Date(report.createdAt);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  const averageBias = analyses.length
    ? analyses.reduce((sum, report) => sum + getBiasSignal(report), 0) / analyses.length
    : 0;

  const improvedCount = analyses.filter((report) => {
    const correctedScore = getCorrectedScore(report);
    return typeof correctedScore === "number" && correctedScore > (report.result?.fairness_summary?.overall_fairness_score ?? 0);
  }).length;

  const complianceAverage = analyses.length
    ? analyses.reduce((sum, report) => sum + (getCorrectedScore(report) ?? (report.result?.fairness_summary?.overall_fairness_score ?? 0)), 0) / analyses.length
    : 0;

  const highRiskCount = analyses.filter((report) => report.result?.fairness_summary?.risk_level === "high").length;
  const targetMetCount = analyses.filter(isTargetMet).length;
  const domains = new Set(analyses.map((report) => report.result?.metadata?.domain ?? "unknown")).size;

  return [
    {
      label: "Total Audits",
      value: String(analyses.length),
      change: `${monthlyCount} this month`,
    },
    {
      label: "Avg Bias Score",
      value: `${formatMetric(averageBias)}%`,
      change: `${highRiskCount} high-risk runs`,
    },
    {
      label: "Models Fixed",
      value: String(improvedCount),
      change: `${targetMetCount} reached 95+`,
    },
    {
      label: "Compliance Score",
      value: `${formatMetric(complianceAverage)}%`,
      change: `${domains} active domains`,
    },
  ];
}

export function buildRecentAuditLogs(analyses: AnalysisPayload[], limit = 3): AuditLogItem[] {
  return analyses.slice(0, limit).map((report) => ({
    id: report.id,
    name: report.input.fileName.replace(/\.[^.]+$/, ""),
    date: formatRelativeTime(report.createdAt),
    biasScore: getBiasSignal(report),
    status: "completed",
    type: getProtocolType(report),
  }));
}

export function buildRadarTrendData(analyses: AnalysisPayload[]): RadarTrendPoint[] {
  const attributeMap = new Map<string, { original: number; corrected: number; count: number }>();

  analyses.forEach((report) => {
    const correctedByColumn = new Map(
      getCorrectedSensitiveFindings(report).map((finding) => [finding.sensitive_column, finding]),
    );

    (report.result?.sensitive_findings ?? []).forEach((finding) => {
      const key = finding.sensitive_column;
      const correctedFinding = correctedByColumn.get(key);
      const current = attributeMap.get(key) ?? { original: 0, corrected: 0, count: 0 };
      current.original += finding.fairness_score;
      current.corrected += correctedFinding?.fairness_score ?? getCorrectedScore(report) ?? finding.fairness_score;
      current.count += 1;
      attributeMap.set(key, current);
    });
  });

  return Array.from(attributeMap.entries())
    .sort((left, right) => right[1].count - left[1].count || left[1].original - right[1].original)
    .slice(0, 6)
    .map(([subject, totals]) => ({
      subject: toTitleCase(subject),
      baseline: Number((totals.original / totals.count).toFixed(2)),
      corrected: Number((totals.corrected / totals.count).toFixed(2)),
      fullMark: 100,
    }));
}

export function buildBiasDistribution(analyses: AnalysisPayload[]): BiasDistributionPoint[] {
  const bins = Array.from({ length: 10 }, (_, index) => ({
    start: index * 10,
    end: index === 9 ? 100 : index * 10 + 10,
    count: 0,
  }));

  analyses.forEach((report) => {
    const bias = getBiasSignal(report);
    const bucketIndex = Math.min(bins.length - 1, Math.floor(bias / 10));
    bins[bucketIndex].count += 1;
  });

  return bins.map((bin) => ({
    name: `${bin.start}`,
    range: `${bin.start}-${bin.end}`,
    value: bin.count,
  }));
}

export function buildPerformanceTrend(analyses: AnalysisPayload[]): PerformanceTrend {
  const monthBuckets = new Map<string, MonthBucket>();
  const groupFrequency = new Map<string, number>();
  let hasNonNumericGroups = false;

  analyses.forEach((report) => {
    const createdAt = new Date(report.createdAt);
    if (Number.isNaN(createdAt.getTime())) return;

    const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
    const bucket = monthBuckets.get(key) ?? {
      date: new Date(createdAt.getFullYear(), createdAt.getMonth(), 1),
      groups: new Map<string, GroupAggregate>(),
      originalFairnessTotal: 0,
      correctedFairnessTotal: 0,
      count: 0,
    };

    bucket.originalFairnessTotal += (report.result?.fairness_summary?.overall_fairness_score ?? 0) / 100;
    bucket.correctedFairnessTotal += (getCorrectedScore(report) ?? (report.result?.fairness_summary?.overall_fairness_score ?? 0)) / 100;
    bucket.count += 1;

    (report.result?.sensitive_findings ?? []).forEach((finding) => {
      getFindingGroupMetrics(finding).forEach((metric) => {
        const groupName = String(metric.group);
        const groupValue = typeof metric.accuracy === "number" ? metric.accuracy : metric.selection_rate;
        if (typeof groupValue !== "number") return;

        if (!isNumericGroup(groupName)) {
          hasNonNumericGroups = true;
        }

        const current = bucket.groups.get(groupName) ?? { total: 0, count: 0 };
        current.total += groupValue;
        current.count += 1;
        bucket.groups.set(groupName, current);
        groupFrequency.set(groupName, (groupFrequency.get(groupName) ?? 0) + 1);
      });
    });

    monthBuckets.set(key, bucket);
  });

  const sortedBuckets = Array.from(monthBuckets.values())
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(-8);

  const groupCandidates = Array.from(groupFrequency.entries())
    .sort((left, right) => {
      const leftNumeric = isNumericGroup(left[0]);
      const rightNumeric = isNumericGroup(right[0]);
      if (leftNumeric !== rightNumeric) return leftNumeric ? 1 : -1;
      if (left[1] !== right[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .map(([name]) => name);

  const preferredGroups = hasNonNumericGroups
    ? groupCandidates.filter((name) => !isNumericGroup(name))
    : groupCandidates;

  const selectedGroups = preferredGroups.slice(0, 3);

  if (selectedGroups.length >= 2) {
    const series = selectedGroups.map((group, index) => ({
      key: `series_${index + 1}`,
      label: group,
      color: linePalette[index].color,
      strokeWidth: linePalette[index].strokeWidth,
      dotRadius: linePalette[index].dotRadius,
      dashArray: linePalette[index].dashArray,
    }));

    const data = sortedBuckets.map((bucket) => {
      const point: TrendPoint = {
        name: bucket.date.toLocaleString("en-US", { month: "short" }),
      };

      series.forEach((entry, index) => {
        const aggregate = bucket.groups.get(selectedGroups[index]);
        point[entry.key] = aggregate ? Number((aggregate.total / aggregate.count).toFixed(3)) : null;
      });

      return point;
    });

    return {
      data,
      series,
      description: "Selection-rate trend across the most frequently observed demographic groups.",
    };
  }

  const series: TrendSeries[] = [
    {
      key: "original",
      label: "Original",
      color: linePalette[0].color,
      strokeWidth: linePalette[0].strokeWidth,
      dotRadius: linePalette[0].dotRadius,
    },
    {
      key: "corrected",
      label: "Corrected",
      color: linePalette[1].color,
      strokeWidth: linePalette[1].strokeWidth,
      dotRadius: linePalette[1].dotRadius,
    },
    {
      key: "target",
      label: "Target",
      color: linePalette[2].color,
      strokeWidth: linePalette[2].strokeWidth,
      dotRadius: linePalette[2].dotRadius,
      dashArray: linePalette[2].dashArray,
    },
  ];

  const data = sortedBuckets.map((bucket) => ({
    name: bucket.date.toLocaleString("en-US", { month: "short" }),
    original: bucket.count ? Number((bucket.originalFairnessTotal / bucket.count).toFixed(3)) : 0,
    corrected: bucket.count ? Number((bucket.correctedFairnessTotal / bucket.count).toFixed(3)) : 0,
    target: 0.95,
  }));

  return {
    data,
    series,
    description: "Monthly fairness trend across original, corrected, and target bands.",
  };
}

function isNumericGroup(value: string) {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
