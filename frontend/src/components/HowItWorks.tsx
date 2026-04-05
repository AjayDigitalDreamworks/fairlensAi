"use client";

const steps = [
  {
    number: "01",
    title: "Input Retrieval",
    description: "Import datasets, deep models, or connect your real-time API endpoint",
    status: "INIT"
  },
  {
    number: "02",
    title: "Bias Scanning",
    description: "Neural engine automatically detects variance across hidden multi-vectors",
    status: "BUSY"
  },
  {
    number: "03",
    title: "Detailed Insights",
    description: "Receive clear metrics showing exactly where bias and drift exist",
    status: "OK"
  },
  {
    number: "04",
    title: "Correction",
    description: "Apply automated re-balancing strategies with a single click",
    status: "READY"
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 sm:py-32 relative overflow-hidden bg-black/60 backdrop-blur-md border-y border-white/5">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="space-y-4 text-center mb-24">
          <h2 className="text-3xl sm:text-5xl font-bold font-sans text-white uppercase tracking-tight">
            How it works
          </h2>
          <p className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground opacity-60">
             From data upload to fairness correction in minutes...
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-12 lg:gap-16">
          {steps.map((step, idx) => (
            <div key={idx} className="relative group flex flex-col items-center">
              <div className="relative mb-8 text-center">
                <div className="h-20 w-20 border border-emerald-500/20 bg-emerald-500/5 group-hover:bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-mono font-bold text-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.1)] group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  {step.number}
                </div>
                <div className="absolute -bottom-2 right-[-10px] px-2 py-0.5 border border-emerald-500/30 text-emerald-300 font-mono text-[8px] font-black group-hover:bg-emerald-400 group-hover:text-black transition-all">
                  {step.status}
                </div>
              </div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-3 text-center transition-colors group-hover:text-emerald-400">
                {step.title}
              </h3>
              <p className="text-[11px] text-muted-foreground text-center font-mono font-bold uppercase tracking-tighter opacity-60 px-4 md:px-0">
                {step.description}
              </p>
              
              {idx < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 -right-8 lg:-right-12 w-10 lg:w-16 h-px bg-emerald-500/10 group-hover:bg-emerald-500/40 transition-all duration-700"></div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 right-0 w-full h-px bg-gradient-to-r from-transparent via-teal-500/20 to-transparent"></div>
    </section>
  );
}
