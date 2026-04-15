"use client";

import Layout from "@/components/Layout";
import { Brain, Layers, Search, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/auth";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelExplainabilityPage() {
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [shapData, setShapData] = useState<{feature: string, importance: number}[]>([]);
  const [latestModel, setLatestModel] = useState<string>("Unknown");

  // Fetch the latest history to see if there is a model we can auto-analyze
  useEffect(() => {
    async function checkLatest() {
      try {
        const res = await apiFetch(`${API_URL}/fairsight/history`);
        if (res.ok) {
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            setLatestModel(data.items[0].modelName || "Latest Upload");
          }
        }
      } catch (err) {
        // ignore
      }
    }
    checkLatest();
  }, []);

  async function analyzeLatest() {
    setLoading(true);
    try {
      // Step 1: Get the latest session from history
      const histRes = await apiFetch(`${API_URL}/fairsight/history`);
      if (!histRes.ok) throw new Error("Could not fetch history");
      const histData = await histRes.json();
      
      if (!histData.items || histData.items.length === 0) {
        alert("No models found in database. Please upload and analyze a model first.");
        setLoading(false);
        return;
      }
      
      const latest = histData.items[0];
      setLatestModel(latest.modelName);

      // Step 2: Request explainability for this session
      const explainRes = await apiFetch(`${API_URL}/fairsight/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: latest.sessionId,
          label_col: latest.labelCol,
          sensitive_col: latest.sensitiveCol,
        }),
      });

      if (!explainRes.ok) throw new Error("Server rejected explainability request. Note: Temporary sessions reset if the server restarts.");
      
      const explainData = await explainRes.json();
      setShapData(explainData.global_feature_importance || []);
      setAnalyzed(true);
    } catch (err: any) {
      alert("Failed to analyze. Ensure the ml-service is running and you have uploaded a model recently without restarting it. " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Brain className="h-8 w-8 text-primary" />
                Dynamic Model Explainability
              </h1>
              <p className="text-sm text-muted-foreground">
                Understand how your model makes decisions using feature importance coefficients extracted directly from your <b>{latestModel}</b> build.
              </p>
            </div>
            <Button onClick={analyzeLatest} disabled={loading} className="bg-primary text-black hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {loading ? "Analyzing Matrix..." : "Extract Live Weights"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Global Feature Importance */}
          <div className="card-glow flex flex-col rounded-xl p-6 min-h-[400px]">
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Global Feature Importance
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">Overall mathematical impact of features extracted from your PKL bundle.</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              {!analyzed && !loading && (
                <p className="text-muted-foreground text-sm italic">Click "Extract Live Weights" to calculate properties.</p>
              )}
              {loading && (
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              )}
              {analyzed && shapData.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={shapData} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 12}} />
                    <YAxis type="category" dataKey="feature" stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.8)", fontSize: 12}} />
                    <Tooltip cursor={{fill: "rgba(255,255,255,0.05)"}} contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                    <Bar dataKey="importance" fill="var(--chart-primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {analyzed && shapData.length === 0 && (
                <p className="text-muted-foreground text-sm italic">Model does not expose readable feature properties.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className={`card-glow flex flex-col rounded-xl p-6 transition-all duration-500 ${analyzed ? 'border-primary/20' : ''}`}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-2">Dependence Interpretation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Algorithm insights based on the mathematical isolation of individual variables.
              </p>
              <div className="flex flex-col p-6 border border-white/5 bg-black/20 rounded-md flex-1 text-muted-foreground text-sm gap-2">
                {analyzed && shapData.length > 0 ? (
                  <>
                    <p className="text-white font-medium">Primary Driver: <span className="text-primary">{shapData[0]?.feature.toUpperCase()}</span></p>
                    <p>The model heavily biases outcome predictions on the <strong className="text-white">{shapData[0]?.feature}</strong> metric with a normalized weight of {(shapData[0]?.importance * 100).toFixed(1)}%.</p>
                    {shapData.length > 1 && (
                      <p>Secondary influence comes from <strong className="text-white">{shapData[1]?.feature}</strong> ({(shapData[1]?.importance * 100).toFixed(1)}%). Review these parameters closely if disparities correspond with sensitive attributes.</p>
                    )}
                  </>
                ) : (
                  <p className="text-center italic mt-4">Awaiting live extraction...</p>
                )}
              </div>
            </div>
            <div className="card-glow flex flex-col rounded-xl p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Architecture Mapping
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Internal matrix routing information for deeper decision structures (like Random Forests or DNNs).
              </p>
              <Button disabled={!analyzed} variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10 transition-colors">
                {analyzed ? 'Open Weight Mapping (PDF)' : 'Locked'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
