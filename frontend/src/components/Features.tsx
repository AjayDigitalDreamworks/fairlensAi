"use client";

import { Shield, Zap, BarChart3, AlertCircle, FileText } from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "Dataset Bias Analyzer",
    description: "Detect gender, region, and class imbalances with precision bias scoring (0-100)",
    iconBg: "bg-emerald-500/10 text-emerald-400",
  },
  {
    icon: Shield,
    title: "Fairness Metrics Engine",
    description: "Calculate Demographic Parity, Equal Opportunity, and Disparate Impact metrics",
    iconBg: "bg-teal-500/10 text-teal-400",
  },
  {
    icon: Zap,
    title: "Bias Mitigation Toolkit",
    description: "One-click automated fixes: re-sampling, re-weighting, adversarial debiasing",
    iconBg: "bg-emerald-400/10 text-emerald-300",
  },
  {
    icon: AlertCircle,
    title: "Explainable AI Layer",
    description: "SHAP/LIME-style explanations that tell you WHY your model is biased",
    iconBg: "bg-emerald-500/10 text-emerald-400",
  },
  {
    icon: Zap,
    title: "Universal API/SDK",
    description: "Works with Python models, web apps, and Google Cloud integrations",
    iconBg: "bg-emerald-400/10 text-emerald-300",
  },
  {
    icon: FileText,
    title: "Auto Fairness Report",
    description: "PDF reports with bias detected, fixes applied, and final fairness score",
    iconBg: "bg-teal-500/10 text-teal-400",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 sm:py-32 relative">
      <div className="absolute left-0 top-1/2 -z-10 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="space-y-4 text-center mb-20 relative z-10">
          <h2 className="text-3xl sm:text-5xl font-bold font-sans text-white uppercase tracking-tight">
            Complete Fairness Suite
          </h2>
          <p className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground opacity-60">
             6 powerful tools to detect, measure, and fix bias automatically...
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 relative z-10">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="group relative border border-emerald-500/10 bg-black/60 backdrop-blur-md p-10 transition-all duration-500 hover:border-emerald-500/40 hover:bg-black/80 hover:-translate-y-2 overflow-hidden"
              >
                {/* Visual Accent */}
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/0 group-hover:bg-emerald-500/20 transition-all duration-700"></div>
                <div className="absolute bottom-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl rounded-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="relative z-10 space-y-6">
                  <div className={`inline-flex p-4 ${feature.iconBg} border border-emerald-500/20 group-hover:border-emerald-500 transition-colors duration-500`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-widest text-white group-hover:text-emerald-400 transition-colors duration-300 font-sans">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed font-mono font-bold uppercase tracking-tighter opacity-70">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
