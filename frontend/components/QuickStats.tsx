"use client";

import type { QuickStatItem } from "@/lib/analysis-insights";

const defaultQuickStats: QuickStatItem[] = [
  { label: "Total Audits", value: "24", change: "+3 this week" },
  { label: "Avg Bias Score", value: "12%", change: "-5 pts" },
  { label: "Models Fixed", value: "18", change: "+2 this month" },
  { label: "Compliance Score", value: "94%", change: "+12 pts" },
];

export default function QuickStats({ stats = defaultQuickStats }: { stats?: QuickStatItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, idx) => (
        <div
          key={idx}
          className="card-glow p-6 space-y-2 hover:border-primary/50 transition-all cursor-crosshair group"
        >
          <p className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground group-hover:text-primary transition-colors">{stat.label}</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-bold text-white font-mono drop-shadow-[0_0_10px_rgba(var(--theme-glow),0.3)]">{stat.value}</h3>
          </div>
          <p className="text-[10px] font-mono text-primary/60 font-bold">{stat.change}</p>
        </div>
      ))}
    </div>
  );
}
