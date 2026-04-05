"use client";

import { Check, ShieldAlert } from "lucide-react";

export default function Benefits() {
  return (
    <section id="benefits" className="py-24 sm:py-32 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 blur-[120px] pointer-events-none"></div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="lg:grid lg:grid-cols-2 lg:gap-24 items-center">
          <div className="space-y-8">
            <h2 className="text-3xl sm:text-5xl font-bold font-sans text-white uppercase tracking-tight">
              The Invisible Bias Crisis
            </h2>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground font-mono font-bold uppercase tracking-widest opacity-80 leading-relaxed">
                AI systems across hiring, finance, and healthcare make biased decisions every day. But current solutions fall short:
              </p>
              <ul className="space-y-4">
                {[
                  "Only work on specific data types (tabular OR text OR image)",
                  "Require deep ML expertise (not developer-friendly)",
                  "Fail to integrate into real-world ML pipelines",
                  "Don't provide actionable, automated bias mitigation",
                  "Lack real-time monitoring after deployment",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-4 p-5 bg-black/40 border border-white/5 hover:border-emerald-500/20 group hover:bg-emerald-500/5 transition-all">
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0 group-hover:scale-110" />
                    <span className="text-[10px] font-mono text-muted-foreground uppercase font-black tracking-widest opacity-80 group-hover:text-emerald-300 group-hover:opacity-100 transition-all">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="relative h-[450px] border border-emerald-500/20 bg-black/60 flex items-center justify-center card-glow group overflow-hidden mt-16 lg:mt-0">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
             <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-teal-500/20 to-transparent"></div>
             
             <div className="text-center relative z-10 p-10 space-y-4">
                <div className="text-6xl font-bold text-emerald-500/20 mb-6 group-hover:scale-110 transition-transform duration-700">
                   <ShieldAlert className="w-20 h-20 mx-auto opacity-40 shadow-[0_0_40px_rgba(16,185,129,0.3)]" />
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-widest group-hover:text-emerald-400 font-sans transition-colors">Impact Simulation</h3>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.3em] font-black opacity-60">Bias monitoring active...</p>
                <div className="mt-8 flex items-center justify-center gap-4">
                    <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[9px] uppercase font-black shadow-[0_0_10px_rgba(16,185,129,0.2)]">Monitoring</div>
                    <div className="px-4 py-2 bg-white/5 border border-white/10 text-white/40 font-mono text-[9px] uppercase font-black">Standby</div>
                </div>
             </div>
             
             {/* Fake scan line */}
             <div className="absolute left-0 top-0 w-full h-[2px] bg-emerald-500/40 animate-scan-y shadow-[0_0_10px_#10b981]"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
