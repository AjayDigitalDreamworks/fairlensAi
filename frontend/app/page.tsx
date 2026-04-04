"use client";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import TrustBadges from "@/components/TrustBadges";
import Benefits from "@/components/Benefits";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Index() {
  return (
    <div className="min-h-screen relative overflow-hidden text-foreground bg-background">
      {/* Animated Background layer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid opacity-30"></div>
        
        {/* Vertical scanning lines */}
        <div className="absolute left-[20%] top-0 w-px h-full bg-gradient-to-b from-transparent via-emerald-500/30 to-transparent animate-scan-y"></div>
        <div className="absolute left-[50%] top-0 w-px h-full bg-gradient-to-b from-transparent via-emerald-400/20 to-transparent animate-scan-y" style={{ animationDelay: '2s' }}></div>
        <div className="absolute left-[80%] top-0 w-px h-full bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent animate-scan-y" style={{ animationDelay: '4s' }}></div>

        {/* Subtle corner glow primarys */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-emerald-400/5 rounded-full blur-[120px]"></div>
      </div>
      
      {/* Main Content Wrapper */}
      <div className="relative z-10">
        <Navbar />
        <Hero />
        <TrustBadges />
        <Features />
        <HowItWorks />
        <Benefits />
        <CTA />
        <Footer />
      </div>
    </div>
  );
}
