import { Link } from "react-router-dom";
import {
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  DollarSign,
  Scale,
  Radio,
  ShieldCheck,
  Award,
  Activity,
  Database,
  Cpu,
  BarChart3,
  Zap,
} from "lucide-react";

const datasetActions = [
  {
    href: "/analyzer",
    icon: TrendingUp,
    title: "Run Dataset Audit",
    description: "Upload a CSV and scan for bias in your data",
    accent: "primary",
    badge: "Dataset",
  },
  {
    href: "/metrics",
    icon: BarChart3,
    title: "Fairness Metrics",
    description: "Disparate Impact, Demographic Parity & more",
    accent: "secondary",
    badge: "Dataset",
  },
  {
    href: "/mitigation",
    icon: AlertTriangle,
    title: "Bias Mitigation",
    description: "See before/after bias correction with ELI5 mode",
    accent: "accent",
    badge: "Dataset",
  },
  {
    href: "/explainability",
    icon: BrainCircuit,
    title: "Explainability",
    description: "SHAP-based feature importance & narration",
    accent: "primary",
    badge: "Dataset",
  },
];

const modelActions = [
  {
    href: "/model-analyzer",
    icon: Cpu,
    title: "Model Analyzer",
    description: "Upload .pkl/.h5 model & run fairness audit",
    accent: "primary",
    badge: "Model",
  },
  {
    href: "/model-metrics",
    icon: Activity,
    title: "Model Metrics",
    description: "DPD, EOD, Disparate Impact per group",
    accent: "secondary",
    badge: "Model",
  },
  {
    href: "/model-mitigation",
    icon: Zap,
    title: "Model Mitigation",
    description: "Apply ThresholdOptimizer / AIF360 wrappers",
    accent: "accent",
    badge: "Model",
  },
  {
    href: "/model-dashboard",
    icon: Database,
    title: "Model Dashboard",
    description: "Full model audit history overview",
    accent: "primary",
    badge: "Model",
  },
];

const platformActions = [
  {
    href: "/compliance",
    icon: Scale,
    title: "Compliance Dashboard",
    description: "Track EEOC & EU AI Act constraints",
    accent: "secondary",
  },
  {
    href: "/cost-calculator",
    icon: DollarSign,
    title: "Cost Calculator",
    description: "Calculate ECOA litigation risk exposure",
    accent: "accent",
  },
  {
    href: "/simulator",
    icon: Activity,
    title: "Bias Simulator",
    description: "See real human impact with live controls",
    accent: "primary",
  },
  {
    href: "/realtime-monitor",
    icon: Radio,
    title: "Live Fairness Monitor",
    description: "WebSocket bias drift detection",
    accent: "primary",
  },
  {
    href: "/prevention",
    icon: ShieldCheck,
    title: "Prevention Scanner",
    description: "Check dataset readiness before training",
    accent: "secondary",
  },
  {
    href: "/certification",
    icon: Award,
    title: "Certification Badge",
    description: "Create shareable fairness compliance proof",
    accent: "accent",
  },
];

const accentStyles = {
  primary: {
    container: "bg-primary/10 border-primary/20 group-hover:bg-primary/20",
    icon: "text-primary",
    glow: "bg-primary/5",
    badge: "border-primary/20 bg-primary/10 text-primary",
  },
  secondary: {
    container: "bg-secondary/10 border-secondary/20 group-hover:bg-secondary/20",
    icon: "text-secondary",
    glow: "bg-secondary/5",
    badge: "border-secondary/20 bg-secondary/10 text-secondary",
  },
  accent: {
    container: "bg-accent/10 border-accent/20 group-hover:bg-accent/20",
    icon: "text-accent",
    glow: "bg-accent/5",
    badge: "border-accent/20 bg-accent/10 text-accent",
  },
} as const;

function ActionCard({ action }: { action: { href: string; icon: any; title: string; description: string; accent: string; badge?: string } }) {
  const Icon = action.icon;
  const style = accentStyles[action.accent as keyof typeof accentStyles];
  return (
    <Link
      to={action.href}
      className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-3 relative z-10">
        <div className={`p-2.5 border transition ${style.container}`}>
          <Icon className={`h-4 w-4 ${style.icon}`} />
        </div>
        <div className="flex items-center gap-2">
          {"badge" in action && action.badge && (
            <span className={`text-[9px] font-mono uppercase tracking-[0.2em] border px-2 py-0.5 ${style.badge}`}>
              {action.badge}
            </span>
          )}
          <ArrowRight className={`h-4 w-4 ${style.icon} opacity-0 group-hover:opacity-100 transition translate-x-3 group-hover:translate-x-0`} />
        </div>
      </div>
      <h3 className="font-bold text-white mb-1 text-sm relative z-10">{action.title}</h3>
      <p className="text-xs text-muted-foreground relative z-10 leading-relaxed">{action.description}</p>
      <div className={`absolute bottom-0 right-0 w-20 h-20 blur-3xl -z-0 ${style.glow}`} />
    </Link>
  );
}

interface QuickActionsProps {
  view?: "all" | "dataset" | "model" | "platform";
}

export default function QuickActions({ view = "all" }: QuickActionsProps) {
  return (
    <div className="space-y-8">
      {(view === "all" || view === "dataset") && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-400" />
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
              Dataset Analysis Suite
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {datasetActions.map((action) => (
              <ActionCard key={action.href} action={action} />
            ))}
          </div>
        </div>
      )}

      {(view === "all" || view === "model") && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300">
              ML Model Analysis Suite
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {modelActions.map((action) => (
              <ActionCard key={action.href} action={action} />
            ))}
          </div>
        </div>
      )}

      {(view === "all" || view === "platform") && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-400" />
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300">
              Platform Tools
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {platformActions.map((action) => (
              <ActionCard key={action.href} action={action} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
