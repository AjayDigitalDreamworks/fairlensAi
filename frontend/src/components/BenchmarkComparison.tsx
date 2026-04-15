import { Building2, TrendingUp, TrendingDown, Target } from "lucide-react";

export default function BenchmarkComparison() {
  return (
    <div className="card-glow p-6 mt-8">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="h-6 w-6 text-[#C9A961]" />
        <h3 className="font-sans text-xl font-bold tracking-tight text-white">Industry Benchmarking</h3>
      </div>
      
      <div className="space-y-6">
        <BenchmarkBar category="Financial Services (Credit)" yourScore={73} industryAverage={75} topPerformer={91} worstCase={52} />
        <BenchmarkBar category="Hiring Algorithms (HR)" yourScore={73} industryAverage={71} topPerformer={94} worstCase={32} />
        <BenchmarkBar category="Healthcare AI Models" yourScore={73} industryAverage={68} topPerformer={89} worstCase={45} />
      </div>

      <div className="mt-6 border border-[#C9A961]/30 bg-[#C9A961]/5 p-6 rounded">
        <h4 className="font-bold text-[#C9A961] flex items-center gap-2">
           <Target className="w-4 h-4" /> Your Competitive Position
        </h4>
        <ul className="mt-4 space-y-2 text-sm text-white/80">
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span> You are in the top 40% of healthcare AI models.
          </li>
          <li className="flex items-center gap-2">
            <span className="text-amber-500">⚠️</span> You are below average for financial services (Goal: 75+).
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[#C9A961]">🏆</span> Immediate Goal: Reach 85+ to match top performers and reduce lawsuit risk by 80%.
          </li>
        </ul>
      </div>
    </div>
  );
}

function BenchmarkBar({ category, yourScore, industryAverage, topPerformer, worstCase }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-white font-medium">{category}</span>
        <span className="text-muted-foreground">Your Score: <strong className="text-white">{yourScore}/100</strong></span>
      </div>
      <div className="relative h-4 bg-black/40 rounded-full border border-white/10 overflow-hidden">
        {/* Worst Case */}
        <div className="absolute top-0 bottom-0 left-0 bg-red-500/20" style={{ width: `${worstCase}%` }} title="Worst Case" />
        {/* Industry Average */}
        <div className="absolute top-0 bottom-0 bg-white/20 w-px" style={{ left: `${industryAverage}%` }} title="Industry Avg" />
        {/* Your Score */}
        <div className="absolute top-0 bottom-0 left-0 bg-[#C9A961]/60" style={{ width: `${yourScore}%` }} />
        {/* Top Performer */}
        <div className="absolute top-0 bottom-0 bg-emerald-500/50 w-1" style={{ left: `${topPerformer}%` }} title="Top Performer" />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground px-1">
        <span>Worst: {worstCase}</span>
        <span style={{ position: 'absolute', left: `calc(${industryAverage}% - 20px)`}}>Avg: {industryAverage}</span>
        <span>Top: {topPerformer}</span>
      </div>
    </div>
  );
}
