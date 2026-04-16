"use client";

import Layout from "@/components/Layout";
import { useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Info, Users, Activity, Target, Zap } from "lucide-react";

export default function SimulatorPage() {
  const [searchParams] = useSearchParams();
  const initialBias = Number(searchParams.get("bias")) || 50;
  const attribute = searchParams.get("attribute") || "Gender";
  
  const [biasLevel, setBiasLevel] = useState(initialBias);
  const [isMitigating, setIsMitigating] = useState(false);
  
  // Generating people for the UI
  const totalMale = 50;
  const totalFemale = 50;

  // With a high bias level against females, fewer females get accepted vs males
  const maleAcceptanceRate = Math.min(95, 60 + (biasLevel * 0.35));
  const femaleAcceptanceRate = Math.max(5, 60 - (biasLevel * 0.55));
  
  const maleHired = Math.floor((maleAcceptanceRate / 100) * totalMale);
  const femaleHired = Math.floor((femaleAcceptanceRate / 100) * totalFemale);

  const applyMitigation = () => {
    setIsMitigating(true);
    let currentBias = biasLevel;
    const interval = setInterval(() => {
      currentBias -= 5;
      if (currentBias <= 5) {
        setBiasLevel(5);
        clearInterval(interval);
        setIsMitigating(false);
      } else {
        setBiasLevel(currentBias);
      }
    }, 150);
  };

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        <div className="card-glow p-8 mt-8 border-l-4 border-l-[#C9A961]">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-8 h-8 text-[#C9A961]" />
            <h1 className="font-sans text-3xl font-bold tracking-tight text-white">Interactive Bias Simulator</h1>
          </div>
          <p className="text-muted-foreground">Adjust the slider below to see how hidden algorithmic bias silently rejects qualified candidates in real-time.</p>
        </div>

        <div className="card-glow p-8">
           <div className="mb-8">
              <label className="flex justify-between items-center mb-4">
                 <span className="font-bold text-white text-lg">Model Bias Level ({attribute})</span>
                 <span className={`px-3 py-1 rounded text-sm font-bold ${biasLevel > 30 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{biasLevel}% Bias</span>
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={biasLevel}
                onChange={(e) => setBiasLevel(Number(e.target.value))}
                className="w-full h-2 bg-black rounded-lg appearance-none cursor-pointer border border-white/10"
                style={{ accentColor: biasLevel > 30 ? '#ef4444' : '#10b981'}}
                disabled={isMitigating}
              />
           </div>

           <div className="grid grid-cols-2 gap-8 mb-8">
              {/* Male Column */}
              <div className="border border-blue-500/30 bg-blue-500/5 p-6 rounded-lg relative overflow-hidden">
                 <h3 className="text-blue-400 font-bold mb-4 flex items-center justify-between">
                   Male Applicants 
                   <span className="text-2xl font-mono">{maleHired}/{totalMale}</span>
                 </h3>
                 <div className="grid grid-cols-10 gap-2">
                    {Array.from({ length: totalMale }).map((_, i) => (
                       <div 
                         key={i} 
                         className={`w-full aspect-square rounded-full transition-all duration-500 ${
                           i < maleHired 
                             ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] scale-110' 
                             : 'bg-black border border-white/20 opacity-30'
                         }`}
                       />
                    ))}
                 </div>
                 <div className="mt-4 text-center text-sm font-bold text-blue-400 tracking-wider">
                    {Math.round(maleAcceptanceRate)}% APPROVAL RATE
                 </div>
              </div>

              {/* Female Column */}
              <div className="border border-pink-500/30 bg-pink-500/5 p-6 rounded-lg relative overflow-hidden">
                 <h3 className="text-pink-400 font-bold mb-4 flex items-center justify-between">
                   Female Applicants 
                   <span className="text-2xl font-mono">{femaleHired}/{totalFemale}</span>
                 </h3>
                 <div className="grid grid-cols-10 gap-2">
                    {Array.from({ length: totalFemale }).map((_, i) => (
                       <div 
                         key={i} 
                         className={`w-full aspect-square rounded-full transition-all duration-500 ${
                           i < femaleHired 
                             ? 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.8)] scale-110' 
                             : 'bg-red-500 border border-red-500/50 opacity-40 shadow-[inset_0_0_8px_rgba(239,68,68,0.5)]' /* Showing rejected as red/sad */
                         }`}
                       />
                    ))}
                 </div>
                 <div className="mt-4 text-center text-sm font-bold text-pink-400 tracking-wider">
                    {Math.round(femaleAcceptanceRate)}% APPROVAL RATE
                 </div>
              </div>
           </div>

           <div className={`p-6 rounded-lg border flex items-center justify-between transition-colors ${
             biasLevel > 30 ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
           }`}>
              <div>
                 <div className={`text-2xl font-bold ${biasLevel > 30 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {biasLevel > 30 ? '💔' : '🎉'} {totalFemale - femaleHired} qualified {attribute.toLowerCase() === 'gender' ? 'women' : 'individuals'} rejected unfairly
                 </div>
                 <p className="text-sm text-white/50 mt-1">
                    In a real company with 100,000 applications/year, that's {(totalFemale - femaleHired) * 1000} human beings denied opportunities due to {attribute.toLowerCase()} bias.
                 </p>
              </div>

              <Button 
                onClick={applyMitigation}
                disabled={biasLevel <= 5 || isMitigating}
                className="bg-[#C9A961] hover:bg-[#C9A961]/80 text-black font-bold h-12 px-8 shadow-[0_0_20px_rgba(201,169,97,0.4)]"
              >
                {isMitigating ? 'Applying mathematical restraints...' : '🛡️ Apply Fairness Fix (Auto-Balancing)'}
              </Button>
           </div>
        </div>
      </div>
    </Layout>
  );
}
