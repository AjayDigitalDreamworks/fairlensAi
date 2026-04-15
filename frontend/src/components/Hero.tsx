"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import NeuralCore from "@/components/NeuralCore";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-32 lg:pt-24 lg:pb-40">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-background to-background"></div>
      <div className="absolute top-0 right-0 -z-10 w-[800px] h-[800px] bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-full blur-[120px] opacity-50 animate-glow-pulse pointer-events-none"></div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-center">
          {/* Left Column: Text Content */}
          <div className="lg:col-span-6 space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center rounded-none border border-[#C9A961]/30 bg-[#C9A961]/10 px-4 py-1.5 text-[10px] font-black font-mono text-[#C9A961] shadow-[0_0_15px_rgba(201,169,97,0.3)] transition-colors hover:bg-[#C9A961]/20 cursor-default animate-float uppercase tracking-widest">
              <span className="flex h-1.5 w-1.5 rounded-full bg-[#C9A961] mr-2 animate-pulse"></span>
              Legal Insurance For Your AI Models
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
              Stop Your AI From
              <br />
              <span className="text-transparent bg-clip-text bg-[#C9A961] animate-gradient-x drop-shadow-md">
                Getting Sued
              </span>
            </h1>

            <p className="max-w-2xl mx-auto lg:mx-0 text-lg sm:text-xl text-muted-foreground/90 font-mono text-sm leading-relaxed uppercase tracking-tighter opacity-80">
              The $2M mistake you haven't made yet. We prevent lawsuits by detecting bias 3 months before deployment, translating it to dollars lawyers understand, and certifying your model court-ready.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4">
              <Button asChild size="lg" className="bg-[#8B0000] text-white font-bold uppercase tracking-[0.3em] text-[10px] px-10 py-8 rounded-none shadow-[0_0_30px_rgba(139,0,0,0.4)] hover:brightness-110 transition-all border border-red-500">
                <Link to="/simulator">
                  Test the $2M Risk Simulator
                  <ArrowRight className="h-4 w-4 ml-3" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-[#C9A961]/30 text-[#C9A961] font-mono text-[10px] uppercase font-black px-10 py-8 rounded-none hover:bg-[#C9A961]/10 transition-all">
                <Link to="/compliance">
                  Generate Legal Report
                </Link>
              </Button>
            </div>
          </div>

          {/* Right Column: Visual/Mockup */}
          <div className="lg:col-span-6 mt-16 lg:mt-0 relative perspective-[2000px]">
             <div className="relative border border-emerald-500/20 bg-black/60 backdrop-blur-xl shadow-2xl overflow-hidden transform group hover:-translate-y-2 transition-all duration-700 ease-out shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                {/* Image Window Controls */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-500/20 bg-black/80">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-none bg-red-500/40"></div>
                    <div className="h-2.5 w-2.5 rounded-none bg-yellow-500/40"></div>
                    <div className="h-2.5 w-2.5 rounded-none bg-emerald-500/40"></div>
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 text-[9px] font-mono font-black uppercase tracking-widest text-muted-foreground/60">FairLens AI Audit Engine</div>
                </div>
                
                {/* Dynamic Neural Core Visualization */}
                <div className="relative p-1 bg-black/40">
                  <NeuralCore />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent pointer-events-none"></div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </section>
  );
}
