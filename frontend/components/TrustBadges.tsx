"use client";

export default function TrustBadges() {
  return (
    <section className="border-y border-white/5 bg-black/40 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none"></div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="text-center mb-10">
          <div className="text-[10px] font-mono font-black text-emerald-400 uppercase tracking-[0.4em] opacity-80 flex items-center justify-center gap-4">
             <div className="w-8 h-px bg-emerald-500/30"></div>
             Trusted by Neural-Centric Enterprises
             <div className="w-8 h-px bg-emerald-500/30"></div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 lg:gap-10">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center justify-center h-16 bg-white/5 border border-white/5 hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all duration-300 backdrop-blur-sm grayscale opacity-40 hover:grayscale-0 hover:opacity-100 overflow-hidden relative group/badge">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover/badge:translate-x-full transition-transform duration-700"></div>
              <span className="text-white/60 font-mono font-black text-[10px] uppercase tracking-widest relative z-10 group-hover:text-white">NODE {i} CORE</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
