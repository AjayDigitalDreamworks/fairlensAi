"use client";

import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 flex items-center justify-center text-primary font-bold text-sm border border-primary/50 bg-primary/10 shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" style={{ borderRadius: 'var(--theme-border-radius)' }}>
              F
            </div>
            <span className="text-xl font-bold glow-text">FairAI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-mono text-[10px] font-bold">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-mono text-[10px] font-bold">
              Protocol
            </a>
            <a href="#benefits" className="text-sm text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-mono text-[10px] font-bold">
              Intelligence
            </a>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild className="bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[10px] px-6 h-10 hover:bg-primary/90 transition-all border border-primary/80 shadow-[0_0_15px_rgba(var(--theme-glow),0.2)]">
              <Link to="/dashboard">Access Hub</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
