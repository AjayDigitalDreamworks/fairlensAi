import { useState } from "react";
import { BookOpen, Activity } from "lucide-react";

export default function ELI5Card() {
  const [isELI5, setIsELI5] = useState(false);

  return (
    <div className="card-glow relative p-6 border border-white/10 mt-6 rounded-lg overflow-hidden">
       {/* Toggle Switch */}
       <div className="absolute top-6 right-6 flex items-center gap-2">
          <span className={`text-xs ${!isELI5 ? 'text-[#C9A961] font-bold' : 'text-muted-foreground'}`}>Technical</span>
          <button 
             onClick={() => setIsELI5(!isELI5)}
             className={`w-10 h-5 rounded-full relative transition-colors ${isELI5 ? 'bg-[#C9A961]' : 'bg-white/20'}`}
          >
             <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${isELI5 ? 'translate-x-5' : ''}`} />
          </button>
          <span className={`text-xs ${isELI5 ? 'text-[#C9A961] font-bold' : 'text-muted-foreground'}`}>Explain Like I'm 5</span>
       </div>

       <div className="mb-6 flex items-center gap-3">
          {isELI5 ? <BookOpen className="text-[#C9A961]" /> : <Activity className="text-white" />}
          <h3 className="text-lg font-bold text-white">{isELI5 ? "What does this mean for real people?" : "Demographic Parity Analysis"}</h3>
       </div>

       {!isELI5 ? (
          <div className="space-y-4">
             <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-sm font-mono text-white/70">Demographic Parity Difference (DPD)</span>
                <span className="text-sm font-mono text-red-400 font-bold">0.32</span>
             </div>
             <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-sm font-mono text-white/70">True Positive Rate Gap (TPR Gap)</span>
                <span className="text-sm font-mono text-red-400 font-bold">0.18</span>
             </div>
             <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-sm font-mono text-white/70">Disparate Impact Ratio (DIR)</span>
                <span className="text-sm font-mono text-red-400 font-bold">0.65</span>
             </div>
             <p className="text-xs text-muted-foreground mt-4">
               The DIR violates the 80% (4/5ths) rule defined by EEOC guidelines. Mitigation via threshold optimization is strictly prescribed.
             </p>
          </div>
       ) : (
          <div className="bg-black/60 p-6 rounded-lg border border-[#C9A961]/20">
             <p className="text-lg mb-4 text-white font-medium">Imagine you have 100 job applications:</p>
             
             <div className="grid grid-cols-2 gap-4">
               <div className="border border-blue-500/30 bg-blue-500/5 p-4 rounded">
                 <div className="text-blue-400 font-bold mb-2">Group A (50 people)</div>
                 <div className="text-3xl text-blue-400 mb-1">40 hired</div>
                 <div className="text-xs text-muted-foreground">80% approval rate</div>
               </div>
               
               <div className="border border-red-500/30 bg-red-500/5 p-4 rounded">
                 <div className="text-red-400 font-bold mb-2">Group B (50 people)</div>
                 <div className="text-3xl text-red-400 mb-1">20 hired</div>
                 <div className="text-xs text-muted-foreground">40% approval rate</div>
               </div>
             </div>
             
             <div className="mt-6 bg-red-500/10 border border-red-500/30 p-4 rounded flex items-start gap-3">
               <div className="text-red-400 font-bold text-xl mt-1">⚠️</div>
               <div>
                  <div className="font-bold text-red-400">Your AI is 50% more likely to approve Group A over Group B.</div>
                  <p className="text-sm mt-2 text-white/80">
                    Both groups have the exact same qualifications, but the artificial intelligence is rejecting Group B because of bad training data. If you deploy this, it is considered illegal discrimination under US law.
                  </p>
               </div>
             </div>
          </div>
       )}
    </div>
  );
}
