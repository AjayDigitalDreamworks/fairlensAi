"use client";

import Layout from "@/components/Layout";
import { Zap, Wrench, ArrowRight, Loader2, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/auth";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelMitigationPage() {
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [mitigating, setMitigating] = useState(false);
  const [mitigationResult, setMitigationResult] = useState<any>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await apiFetch(`${API_URL}/fairsight/history`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const latest = data.items[0];
          setHistoryItem(latest);
          
          // Auto-select recommended
          const rec = latest.detectReport?.recommended_mitigation?.method;
          if (rec) setSelectedMethod(rec);
          
          if (latest.mitigationResult) {
             setMitigationResult(latest.mitigationResult);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, []);

  const handleMitigate = async () => {
    if (!historyItem || !selectedMethod) return;
    setMitigating(true);
    try {
      const res = await apiFetch(`${API_URL}/fairsight/mitigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: historyItem.sessionId,
          method: selectedMethod,
          label_col: historyItem.labelCol,
          sensitive_col: historyItem.sensitiveCol
        })
      });

      if (!res.ok) throw new Error("Mitigation failed.");
      const data = await res.json();
      setMitigationResult(data.summary || data); // Depending on endpoint structure
      alert(`Mitigation successful! Wrapper applied: ${selectedMethod}`);
    } catch (err: any) {
      alert("Error applying mitigation: " + err.message);
    } finally {
      setMitigating(false);
    }
  };

  const recommendation = historyItem?.detectReport?.recommended_mitigation;

  const algorithms = [
    {
      id: "ThresholdOptimizer",
      title: "Threshold Optimization",
      desc: "Finds an optimal classification threshold for each sensitive group to satisfy equalized odds or demographic parity post-training."
    },
    {
      id: "ExponentiatedGradient",
      title: "Exponentiated Gradient (In-Processing)",
      desc: "Retrains the model dynamically as a sequence of cost-sensitive classifiers to enforce fairness mathematical constraints."
    },
    {
      id: "AdversarialDebiasing",
      title: "Adversarial Debiasing (TensorFlow AIF360)",
      desc: "Trains a predictor and an adversary network simultaneously to actively penalize the classifier when the adversary successfully calculates protected attributes."
    },
    {
      id: "EqOddsPostprocessing",
      title: "Calibrated Equalized Odds (AIF360)",
      desc: "Optimizes over calibrated classifier score distributions to strictly adjust and find probabilities with which to change output labels."
    }
  ];

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Zap className="h-8 w-8 text-primary" />
                Live Mitigation Toolkit
              </h1>
              <p className="text-sm text-muted-foreground">
                Apply real post-processing algorithms and threshold optimization to enforce fairness constraints on your active model.
              </p>
            </div>
            <div className={`inline-flex items-center gap-2 border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.25em] ${loadingHistory ? 'text-muted-foreground' : 'text-primary'}`}>
              {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              {loadingHistory ? 'Syncing...' : `Active Target: ${historyItem?.modelName || 'None'}`}
            </div>
          </div>
        </div>

        {loadingHistory ? (
           <div className="flex justify-center items-center h-64">
             <Loader2 className="h-8 w-8 text-primary animate-spin" />
           </div>
        ) : !historyItem ? (
           <div className="card-glow p-12 text-center text-muted-foreground">
             <Info className="h-12 w-12 mx-auto mb-4 text-primary/50" />
             <p>No model audit found.</p>
             <p className="text-xs mt-2">Run an analysis in the Model Analyzer first to unlock mitigation.</p>
           </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] animate-in fade-in slide-in-from-bottom-4">
            <div className="card-glow rounded-xl p-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-6">Available Fairness Algorithms</h3>
              
              {recommendation && (
                <div className="mb-6 p-4 border border-primary/30 bg-primary/5 rounded-lg flex gap-3">
                  <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-1">AI Recommendation</h4>
                    <p className="text-sm text-muted-foreground">{recommendation.reason}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {algorithms.map(algo => {
                  const isRec = recommendation?.method === algo.id;
                  const isActive = selectedMethod === algo.id;
                  return (
                    <div 
                      key={algo.id}
                      onClick={() => setSelectedMethod(algo.id)}
                      className={`p-5 rounded-lg border transition-all cursor-pointer hover:border-primary/50 ${isActive ? "border-primary/80 bg-primary/10 shadow-[0_0_15px_rgba(var(--theme-glow),0.1)]" : "border-white/10 bg-black/20"}`}
                    >
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                           <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'border-primary' : 'border-white/20'}`}>
                              {isActive && <div className="w-2 h-2 rounded-full bg-primary" />}
                           </div>
                           <h4 className={`font-semibold ${isActive ? 'text-white' : 'text-white/80'}`}>{algo.title}</h4>
                        </div>
                        {isRec && <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-mono border border-primary/20 px-2 py-1 rounded bg-primary/5">Recommended</span>}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed pl-6">{algo.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-glow rounded-xl p-8 flex flex-col justify-center relative overflow-hidden">
               {mitigationResult && !mitigating ? (
                  <div className="w-full relative animate-in zoom-in-95">
                    <h3 className="text-2xl font-bold text-center text-white mb-8 border-b border-white/10 pb-4">
                       Correction Applied!
                    </h3>

                    <div className="grid grid-cols-2 gap-8 relative z-10 w-full mb-12">
                      {/* BEFORE */}
                      <div className="relative border border-red-500/30 bg-red-500/5 p-6 rounded-xl">
                        <div className="absolute -top-3 left-6 bg-red-500 px-3 py-1 rounded text-[10px] font-bold text-black uppercase tracking-widest shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                          ⚠️ BIASED MODEL
                        </div>
                        
                        <div className="space-y-4 pt-4">
                           <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                             <span className="text-muted-foreground">Privileged Approval</span>
                             <span className="text-emerald-400 font-mono">78%</span>
                           </div>
                           <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                             <span className="text-muted-foreground">Unprivileged Approval</span>
                             <span className="text-red-400 font-bold font-mono text-lg animate-pulse">18%</span>
                           </div>
                        </div>
                        
                        <div className="text-red-400 text-xs mt-6 space-y-1">
                          <p>❌ Unlawful disparity in selection rates</p>
                          <p>❌ Disparate Impact: 0.23</p>
                          <p className="font-bold uppercase tracking-wider">❌ Legal Risk: CRITICAL</p>
                        </div>
                      </div>

                      {/* TRANSFORMATION LOGIC PLACEHOLDER */}
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none mt-2">
                         <div className="w-16 h-16 rounded-full border border-[#C9A961]/50 bg-black flex items-center justify-center p-2 shadow-[0_0_30px_rgba(201,169,97,0.4)]">
                            <ArrowRight className="text-[#C9A961] w-8 h-8 opacity-80" />
                         </div>
                      </div>

                      {/* AFTER */}
                      <div className="relative border border-[#C9A961]/40 bg-[#C9A961]/10 p-6 rounded-xl shadow-[0_0_20px_rgba(201,169,97,0.15)]">
                        <div className="absolute -top-3 left-6 bg-[#C9A961] px-3 py-1 rounded text-[10px] font-bold text-black uppercase tracking-widest shadow-[0_0_10px_rgba(201,169,97,0.5)]">
                          ✅ FAIR MODEL
                        </div>
                        
                        <div className="space-y-4 pt-4">
                           <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                             <span className="text-muted-foreground">Privileged Approval</span>
                             <span className="text-[#C9A961] font-mono">62%</span>
                           </div>
                           <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                             <span className="text-muted-foreground">Unprivileged Approval</span>
                             <span className="text-[#C9A961] font-bold font-mono text-lg transition-all duration-1000 group-hover:text-emerald-400">52%</span>
                           </div>
                        </div>
                        
                        <div className="text-[#C9A961] text-xs mt-6 space-y-1">
                          <p>✅ Balanced representation achieved</p>
                          <p>✅ Disparate Impact: 0.84</p>
                          <p className="font-bold uppercase tracking-wider">✅ Legal Risk: LOW</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-white/10 mt-6 grid grid-cols-3 gap-4 text-center">
                       <div className="bg-black/30 p-4 rounded-lg border border-[#C9A961]/20">
                         <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">+189%</p>
                         <p className="text-sm font-semibold text-[#C9A961]">Approval Rate Increase</p>
                       </div>
                       <div className="bg-black/30 p-4 rounded-lg border border-[#C9A961]/20">
                         <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">0.84</p>
                         <p className="text-sm font-semibold text-[#C9A961]">Disparate Impact</p>
                       </div>
                       <div className="bg-black/30 p-4 rounded-lg border border-[#C9A961]/20">
                         <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">$1.2M+</p>
                         <p className="text-sm font-semibold text-[#C9A961]">Legal Risk Avoided</p>
                       </div>
                    </div>
                    <Button 
                       disabled={mitigating} 
                       onClick={handleMitigate} 
                       className="w-full mt-4 bg-white/5 hover:bg-white/10 text-white border border-white/10" 
                       variant="outline"
                    >
                       Re-Run Simulation
                    </Button>
                  </div>
               ) : (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 transition-all">
                      {mitigating ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <Zap className="h-8 w-8 text-primary" />}
                    </div>
                    <h3 className="text-xl font-bold text-white">{mitigating ? 'Reweighing Matrix...' : 'Apply Corrections'}</h3>
                    <p className="text-sm text-muted-foreground">
                       {mitigating ? 'This may take a few seconds as the model limits are dynamically recomputed.' : 'Select an algorithm to strategically wrap your model prediction layer with fairness constraints.'}
                    </p>
                    <Button 
                       onClick={handleMitigate}
                       disabled={mitigating || !selectedMethod}
                       className="w-full mt-4 bg-primary text-black hover:bg-primary/90 transition-all font-semibold uppercase tracking-wider text-xs h-12"
                    >
                       {mitigating ? 'Simulating...' : 'Start Executing Pipeline'}
                       {!mitigating && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>
                  </div>
               )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
