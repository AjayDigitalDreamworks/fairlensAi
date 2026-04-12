"use client";

import Layout from "@/components/Layout";
import { Zap, Wrench, ArrowRight, Loader2, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

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
        const res = await fetch(`${API_URL}/fairsight/history`);
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
      const res = await fetch(`${API_URL}/fairsight/mitigate`, {
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
                  <div className="text-center space-y-4 animate-in zoom-in-95">
                    <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 inner-glow text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Correction Applied!</h3>
                    <p className="text-sm text-muted-foreground border-b border-white/10 pb-4 mb-4">
                      The model was wrapped using <b>{mitigationResult.method || selectedMethod}</b>.
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-left">
                       <div className="bg-black/30 p-3 rounded border border-white/5">
                         <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">DPD Reduced</p>
                         <p className="text-lg font-mono text-emerald-400">{mitigationResult.dpd_reduction_pct || 0}%</p>
                       </div>
                       <div className="bg-black/30 p-3 rounded border border-white/5">
                         <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Accuracy Tradeoff</p>
                         <p className="text-lg font-mono text-amber-400">-{mitigationResult.accuracy_drop_pct || 0}%</p>
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
