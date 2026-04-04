"use client";

import { Link } from "react-router-dom";
import { FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const recentAudits = [
  {
    id: 1,
    name: "Hiring Dataset Q4 2024",
    date: "2 hours ago",
    biasScore: 12,
    status: "completed",
    type: "Dataset Analyzer",
  },
  {
    id: 2,
    name: "Loan Approval Model",
    date: "1 day ago",
    biasScore: 35,
    status: "completed",
    type: "Fairness Metrics",
  },
  {
    id: 3,
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

export default function AuditLogs() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
           <FileText className="w-5 h-5 text-primary" />
           Recent Audit Logs
        </h2>
        <Button asChild variant="outline" size="sm" className="border-primary/20 text-primary hover:bg-primary/10 hover:text-primary transition-all font-mono text-[10px] uppercase tracking-widest px-6 h-8">
          <Link to="/reports">Access Full Logs</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {recentAudits.map((audit) => (
          <div
            key={audit.id}
            className="card-glow p-4 flex flex-col md:flex-row items-start md:items-center justify-between hover:border-primary/40 transition-all group cursor-pointer relative overflow-hidden"
          >
            <div className="flex-1 space-y-1 relative z-10 px-2">
              <h3 className="font-bold text-white group-hover:text-primary transition-colors tracking-wide">
                {audit.name}
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{audit.type} • <span className="text-primary/60 font-bold">{audit.date}</span></p>
            </div>
            <div className="flex items-center gap-6 mt-4 md:mt-0 relative z-10 w-full md:w-auto px-2">
              <div
                className={`flex-1 md:flex-none text-center px-6 py-2 border rounded-none flex items-center gap-3 transition-colors ${getBiasBgColor(audit.biasScore)}`}
              >
                <div className="text-left leading-none">
                   <p className="text-[9px] text-white/40 uppercase font-mono tracking-tighter mb-1">Bias Signal</p>
                   <p className={`text-xl font-bold font-mono ${getBiasColor(audit.biasScore)}`}>
                     {audit.biasScore}%
                   </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition translate-x-0 group-hover:translate-x-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
