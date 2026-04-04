"use client";

import type { AuditLogItem } from "@/lib/analysis-insights";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const defaultRecentAudits: AuditLogItem[] = [
  {
    id: "1",
    name: "Hiring Dataset Q4 2024",
    date: "2 hours ago",
    biasScore: 12,
    status: "completed",
    type: "Dataset Analyzer",
  },
  {
    id: "2",
    name: "Loan Approval Model",
    date: "1 day ago",
    biasScore: 35,
    status: "completed",
    type: "Fairness Metrics",
  },
  {
    id: "3",
    name: "Customer Segmentation AI",
    date: "3 days ago",
    biasScore: 55,
    status: "completed",
    type: "Dataset Analyzer",
  },
];

const getBiasColor = (score: number) => {
  if (score < 20) return "text-primary";
  if (score < 50) return "text-secondary";
  return "text-accent";
};

const getBiasBgColor = (score: number) => {
  if (score < 20) return "bg-primary/10 border-primary/20";
  if (score < 50) return "bg-secondary/10 border-secondary/20";
  return "bg-accent/10 border-accent/20";
};

export default function AuditLogs({ audits = defaultRecentAudits }: { audits?: AuditLogItem[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-wide text-white">
          <FileText className="h-5 w-5 text-primary" />
          Recent Audit Logs
        </h2>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 border-primary/20 px-6 font-mono text-[10px] uppercase tracking-widest text-primary transition-all hover:bg-primary/10 hover:text-primary"
        >
          <Link to="/reports">Access Full Logs</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {audits.length ? (
          audits.map((audit) => (
            <div
              key={audit.id}
              className="card-glow group relative cursor-pointer overflow-hidden p-4 transition-all hover:border-primary/40"
            >
              <div className="flex flex-col items-start justify-between md:flex-row md:items-center">
                <div className="relative z-10 flex-1 space-y-1 px-2">
                  <h3 className="font-bold tracking-wide text-white transition-colors group-hover:text-primary">
                    {audit.name}
                  </h3>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {audit.type} | <span className="font-bold text-primary/60">{audit.date}</span>
                  </p>
                </div>

                <div className="relative z-10 mt-4 flex w-full items-center gap-6 px-2 md:mt-0 md:w-auto">
                  <div
                    className={`flex flex-1 items-center gap-3 border px-6 py-2 text-center transition-colors md:flex-none ${getBiasBgColor(audit.biasScore)}`}
                  >
                    <div className="text-left leading-none">
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-tighter text-white/40">Bias Signal</p>
                      <p className={`font-mono text-xl font-bold ${getBiasColor(audit.biasScore)}`}>{audit.biasScore}%</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 translate-x-0 text-primary opacity-20 transition group-hover:translate-x-2 group-hover:opacity-100" />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="card-glow p-6 text-sm text-muted-foreground">
            No audit telemetry has been recorded yet. Launch a FairLens analysis to start filling the activity stream.
          </div>
        )}
      </div>
    </div>
  );
}
