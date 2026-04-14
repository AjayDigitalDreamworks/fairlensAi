import { Link } from "react-router-dom";
import { TrendingUp, CheckCircle, AlertTriangle, ArrowRight, BrainCircuit, DollarSign, Scale, Radio } from "lucide-react";

const actions = [
  {
    href: "/analyzer",
    icon: TrendingUp,
    title: "Run Audit",
    description: "Upload a dataset and scan for bias",
    accent: "primary"
  },
  {
    href: "/cost-calculator",
    icon: DollarSign,
    title: "Cost Calculator",
    description: "Calculate ECOA litigation risk exposure",
    accent: "accent"
  },
  {
    href: "/compliance",
    icon: Scale,
    title: "Compliance Dashboard",
    description: "Track EEOC & federal logic constraints",
    accent: "secondary"
  },
  {
    href: "/realtime-monitor",
    icon: Radio,
    title: "Live Fairness Monitor",
    description: "WebSocket bias drift detection",
    accent: "primary"
  },
  {
    href: "/explainability",
    icon: BrainCircuit,
    title: "Explainability",
    description: "SHAP-based feature importance analysis",
    accent: "primary"
  },
  {
    href: "/mitigation",
    icon: AlertTriangle,
    title: "Mitigation",
    description: "Preview bias correction strategies",
    accent: "accent"
  }
];

const accentStyles = {
  primary: {
    container: "bg-primary/10 border-primary/20 group-hover:bg-primary/20",
    icon: "text-primary",
    glow: "bg-primary/5",
  },
  secondary: {
    container: "bg-secondary/10 border-secondary/20 group-hover:bg-secondary/20",
    icon: "text-secondary",
    glow: "bg-secondary/5",
  },
  accent: {
    container: "bg-accent/10 border-accent/20 group-hover:bg-accent/20",
    icon: "text-accent",
    glow: "bg-accent/5",
  },
} as const;

export default function QuickActions() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {actions.map((action, idx) => {
        const Icon = action.icon;
        const style = accentStyles[action.accent as keyof typeof accentStyles];
        return (
           <Link key={idx} to={action.href} className="card-glow p-6 hover:border-primary/50 transition-all group cursor-pointer relative overflow-hidden">
             <div className="flex items-start justify-between mb-4 relative z-10">
               <div className={`p-3 border transition ${style.container}`}>
                 <Icon className={`h-5 w-5 ${style.icon}`} />
               </div>
               <ArrowRight className={`h-5 w-5 ${style.icon} opacity-0 group-hover:opacity-100 transition translate-x-4 group-hover:translate-x-0`} />
             </div>
             <h3 className="font-bold text-white mb-1 text-sm relative z-10">{action.title}</h3>
             <p className="text-xs text-muted-foreground relative z-10">{action.description}</p>
             <div className={`absolute bottom-0 right-0 w-24 h-24 blur-3xl -z-0 ${style.glow}`}></div>
           </Link>
        );
      })}
    </div>
  );
}
