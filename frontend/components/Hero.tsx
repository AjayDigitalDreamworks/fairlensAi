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
            <div className="inline-flex items-center rounded-none border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-[10px] font-black font-mono text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-colors hover:bg-emerald-500/20 cursor-default animate-float uppercase tracking-widest">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
              AI Fairness Audit Platform
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
              Detect & Fix
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 animate-gradient-x">
                Bias in AI
              </span>
            </h1>

            <p className="max-w-2xl mx-auto lg:mx-0 text-lg sm:text-xl text-muted-foreground/90 font-mono text-sm leading-relaxed uppercase tracking-tighter opacity-80">
              Automated fairness auditing for AI models. Upload your dataset and get a complete bias analysis with corrected outputs — for hiring, finance, and healthcare.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4">
              <Button asChild size="lg" className="bg-emerald-500 text-black font-bold uppercase tracking-[0.3em] text-[10px] px-10 py-8 rounded-none shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:brightness-110 transition-all border border-emerald-400">
                <Link to="/dashboard">
                  Start Free Audit
                  <ArrowRight className="h-4 w-4 ml-3" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-emerald-500/30 text-white font-mono text-[10px] uppercase font-black px-10 py-8 rounded-none hover:bg-emerald-500/10 transition-all">
                View Live Demo
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
