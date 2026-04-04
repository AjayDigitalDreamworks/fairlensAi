"use client";

import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";

export default function CTA() {
  return (
    <section className="py-24 sm:py-32 relative overflow-hidden group/cta">
      <div className="absolute inset-0 bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none -z-10 translate-y-1/2"></div>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="border border-emerald-500/30 bg-black/80 backdrop-blur-3xl p-16 sm:p-24 text-center text-white shadow-[0_0_80px_rgba(16,185,129,0.15)] relative overflow-hidden group">
          
          {/* Corner Elements */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-emerald-500/30 group-hover:border-emerald-500 transition-all"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-500/30 group-hover:border-emerald-500 transition-all"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-500/30 group-hover:border-emerald-500 transition-all"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-emerald-500/30 group-hover:border-emerald-500 transition-all"></div>

          <div className="relative z-10 space-y-10">
            <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-none mb-6 animate-pulse group-hover:scale-110 transition-transform">
               <Zap className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_15px_#10b981]" />
            </div>
            
            <h2 className="text-4xl sm:text-6xl font-bold font-sans text-white uppercase tracking-tight">
              Ready to Restore <br /> <span className="text-emerald-400">Neural Parity?</span>
            </h2>
            
            <p className="text-sm sm:text-lg text-white/50 font-mono uppercase tracking-widest max-w-2xl mx-auto font-black leading-relaxed">
              Start your free structural audit today. No credit card required. Get actionable insights in minutes.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center pt-10">
              <Button asChild size="lg" className="bg-emerald-500 text-black font-bold uppercase tracking-[0.4em] text-[10px] px-14 py-8 rounded-none shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:brightness-110 transition-all border border-emerald-400">
                <Link to="/dashboard">
                   Initialize Free Audit
                   <ArrowRight className="h-4 w-4 ml-3" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/10 text-white font-mono text-[10px] uppercase font-black px-12 py-8 rounded-none hover:bg-white/5 transition-all"
              >
                Schedule Protocol Demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
