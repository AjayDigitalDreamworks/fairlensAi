"use client";

import { Github, Twitter, Linkedin, MessageCircle } from "lucide-react";

const footerLinks = [
  {
    title: "Intelligence Hub",
    links: [
      { name: "Core Features", href: "#" },
      { name: "Node Pricing", href: "#" },
      { name: "Neural Docs", href: "#" },
    ],
  },
  {
    title: "Operational Units",
    links: [
      { name: "About Protocol", href: "#" },
      { name: "Signal Blog", href: "#" },
      { name: "Contact Sync", href: "#" },
    ],
  },
  {
    title: "Legal Protocols",
    links: [
      { name: "Privacy Matrix", href: "#" },
      { name: "Terms of Use", href: "#" },
      { name: "Security Audit", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black/60 relative overflow-hidden backdrop-blur-md">
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 blur-[120px] pointer-events-none -z-10"></div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 relative z-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-16 mb-20">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="h-10 w-10 flex items-center justify-center text-emerald-400 font-bold text-lg border border-emerald-500/30 bg-emerald-500/5 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                F
              </div>
              <span className="font-bold text-white text-2xl font-sans tracking-tight glow-text group-hover:text-emerald-400 transition-colors">FairAI</span>
            </div>
            <p className="text-xs font-mono font-black text-muted-foreground uppercase tracking-[0.3em] opacity-60 leading-relaxed max-w-xs">
              Universal DevOps for AI Fairness. Neural Core Engine established to find and fix structural bias across global data streams.
            </p>
            <div className="flex gap-4">
               {[Twitter, Linkedin, Github, MessageCircle].map((Icon, idx) => (
                  <a key={idx} href="#" className="p-2 border border-white/5 bg-white/2 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-muted-foreground hover:text-emerald-400 transition-all rounded-none">
                     <Icon className="w-4 h-4" />
                  </a>
               ))}
            </div>
          </div>
          
          {footerLinks.map((section, idx) => (
            <div key={idx} className="space-y-6">
              <h4 className="text-[10px] font-bold text-white uppercase tracking-[0.4em] flex items-center gap-2">
                 <div className="w-1 h-3 bg-emerald-500"></div>
                 {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link, lIdx) => (
                  <li key={lIdx}>
                    <a href={link.href} className="text-[10px] font-mono text-muted-foreground hover:text-emerald-400 transition-colors uppercase tracking-widest block py-1">
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="border-t border-white/5 pt-10 flex flex-col sm:flex-row justify-between items-center text-[10px] font-mono text-muted-foreground uppercase tracking-widest opacity-60">
          <p>&copy; 2024 FairAI Core. All operational protocols active.</p>
          <div className="flex gap-8 mt-6 sm:mt-0">
            <span className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#34d399]"></div>
               Service Online
            </span>
            <span className="hover:text-emerald-400 cursor-pointer transition-colors">v7.0 Stable</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
