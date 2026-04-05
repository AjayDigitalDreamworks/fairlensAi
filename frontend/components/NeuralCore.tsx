"use client";

import { motion } from "framer-motion";

export default function NeuralCore() {
  return (
    <div className="relative w-full aspect-square bg-black/40 flex items-center justify-center overflow-hidden border border-primary/10 group">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-grid opacity-20 group-hover:opacity-30 transition-opacity"></div>
      
      {/* Main Core Glow */}
      <div className="absolute w-64 h-64 bg-primary/5 rounded-full blur-[100px] animate-glow-pulse"></div>
      
      {/* Abstract Neural Geometry */}
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        {/* Central Equilibrium Node */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, 90, 180, 270, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="relative w-48 h-48 border border-primary/30 flex items-center justify-center"
        >
           <div className="absolute inset-0 border border-primary/10 rotate-45 scale-110"></div>
           <div className="w-12 h-12 bg-primary/20 border border-primary shadow-[0_0_20px_rgba(var(--theme-glow),0.5)]"></div>
        </motion.div>
 
        {/* Orbiting Nodes (Balanced) */}
        {[0, 60, 120, 180, 240, 300].map((angle, idx) => (
          <motion.div
            key={idx}
            initial={{ rotate: angle }}
            animate={{ rotate: angle + 360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px]"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary/80 shadow-[0_0_10px_rgba(var(--theme-glow),0.8)] border border-primary"></div>
          </motion.div>
        ))}
 
        {/* Data Streams (Vertical Bars) */}
        <div className="absolute bottom-10 left-10 right-10 h-20 flex items-end gap-1 px-4">
           {[...Array(20)].map((_, i) => (
              <motion.div
                 key={i}
                 initial={{ height: "10%" }}
                 animate={{ height: [`${Math.random() * 80 + 20}%`, `${Math.random() * 80 + 20}%`, `${Math.random() * 80 + 20}%`] }}
                 transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, ease: "easeInOut" }}
                 className="flex-1 bg-primary/30 border-t border-primary/60"
              />
           ))}
        </div>
 
        {/* Binary Overlay */}
        <div className="absolute top-10 left-10 text-[8px] font-mono text-primary/40 uppercase tracking-widest leading-none">
           INIT://AI_AUDIT_SYNC<br/>
           LOAD://FAIRNESS_VECTORS<br/>
           STATUS://READY
        </div>
 
        {/* Scanning Line */}
        <div className="absolute left-0 top-0 w-full h-[2px] bg-primary/40 animate-scan-y shadow-[0_0_10px_rgba(var(--theme-glow),0.5)]"></div>
      </div>
    </div>
  );
}
