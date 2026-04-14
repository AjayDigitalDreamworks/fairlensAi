"use client";

import Layout from "@/components/Layout";
import { useEffect, useState, useRef, useCallback } from "react";
import { connectFairnessMonitor, formatDollar } from "@/lib/compliance-api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  Activity, Wifi, WifiOff, Shield, ShieldAlert, ShieldCheck,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  DollarSign, Zap, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonitorSnapshot {
  timestamp: number;
  tick: number;
  metrics: {
    disparate_impact: number;
    dpd: number;
    eod: number;
    accuracy: number;
    fairness_score: number;
  };
  compliance: {
    ecoa_4_5ths: boolean;
    dpd_threshold: boolean;
    overall: boolean;
    status: string;
  };
  drift: {
    detected: boolean;
    alert_level: string;
  };
  cost_exposure: {
    total: number;
    litigation: number;
    regulatory: number;
  };
  model_health: {
    status: string;
    uptime_pct: number;
    predictions_today: number;
  };
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: any; bg: string }> = {
    HEALTHY: { color: "text-emerald-400", icon: ShieldCheck, bg: "bg-emerald-500/10 border-emerald-500/20" },
    AT_RISK: { color: "text-amber-400", icon: ShieldAlert, bg: "bg-amber-500/10 border-amber-500/20" },
    DEGRADED: { color: "text-red-400", icon: ShieldAlert, bg: "bg-red-500/10 border-red-500/20" },
    COMPLIANT: { color: "text-emerald-400", icon: CheckCircle2, bg: "bg-emerald-500/10 border-emerald-500/20" },
    "NON-COMPLIANT": { color: "text-red-400", icon: AlertTriangle, bg: "bg-red-500/10 border-red-500/20" },
    NORMAL: { color: "text-emerald-400", icon: CheckCircle2, bg: "bg-emerald-500/10 border-emerald-500/20" },
    WARNING: { color: "text-amber-400", icon: AlertTriangle, bg: "bg-amber-500/10 border-amber-500/20" },
    CRITICAL: { color: "text-red-400", icon: AlertTriangle, bg: "bg-red-500/10 border-red-500/20" },
  };
  const c = config[status] || config.NORMAL;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${c.color} ${c.bg}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

function MetricGauge({ label, value, threshold, unit, inverse }: {
  label: string; value: number; threshold: number; unit?: string; inverse?: boolean;
}) {
  const isOk = inverse ? value <= threshold : value >= threshold;
  const pct = Math.min(100, Math.max(0, inverse ? (1 - value / (threshold * 2)) * 100 : (value / 1) * 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-sm font-bold ${isOk ? "text-emerald-400" : "text-red-400"}`}>
          {value.toFixed(4)}{unit || ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOk ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Threshold: {threshold}</span>
        <span>{isOk ? "✓ PASS" : "✗ FAIL"}</span>
      </div>
    </div>
  );
}

export default function RealtimeMonitorPage() {
  const [connected, setConnected] = useState(false);
  const [domain, setDomain] = useState<"credit" | "hiring">("credit");
  const [history, setHistory] = useState<MonitorSnapshot[]>([]);
  const [current, setCurrent] = useState<MonitorSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [simulationMode, setSimulationMode] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulation fallback for when WebSocket isn't available
  const startSimulation = useCallback(() => {
    setSimulationMode(true);
    setConnected(true);
    let tick = 0;
    const baseDI = 0.82 + Math.random() * 0.06 - 0.03;
    const baseDPD = 0.08 + Math.random() * 0.04 - 0.02;
    const baseEOD = 0.06 + Math.random() * 0.04 - 0.02;
    const driftStart = 15 + Math.floor(Math.random() * 15);

    intervalRef.current = setInterval(() => {
      tick++;
      const driftFactor = tick >= driftStart ? Math.min(0.15, (tick - driftStart) * 0.005) : 0;
      const noise = () => (Math.random() - 0.5) * 0.016;

      const di = Math.max(0.5, Math.min(1, baseDI - driftFactor + noise()));
      const dpd = Math.max(0, Math.min(0.4, baseDPD + driftFactor * 0.8 + noise() * 0.5));
      const eod = Math.max(0, Math.min(0.35, baseEOD + driftFactor * 0.6 + noise() * 0.4));
      const accuracy = Math.max(0.7, Math.min(0.99, 0.89 - driftFactor * 0.2 + noise() * 0.3));
      const fairness = Math.max(0, Math.min(100, 85 - driftFactor * 100 + (Math.random() - 0.5) * 3));

      const ecoaOk = di >= 0.80;
      const dpdOk = dpd <= 0.10;
      const overall = ecoaOk && dpdOk;
      const severity = overall ? "low" : di < 0.70 ? "high" : "moderate";

      const costMap: Record<string, number> = { low: 180000, moderate: 950000, high: 2300000 };
      const totalCost = costMap[severity] || 950000;

      const snapshot: MonitorSnapshot = {
        timestamp: Date.now() / 1000,
        tick,
        metrics: {
          disparate_impact: Number(di.toFixed(4)),
          dpd: Number(dpd.toFixed(4)),
          eod: Number(eod.toFixed(4)),
          accuracy: Number(accuracy.toFixed(4)),
          fairness_score: Number(fairness.toFixed(2)),
        },
        compliance: {
          ecoa_4_5ths: ecoaOk,
          dpd_threshold: dpdOk,
          overall,
          status: overall ? "COMPLIANT" : "NON-COMPLIANT",
        },
        drift: {
          detected: tick >= driftStart + 5,
          alert_level: tick >= driftStart + 10 ? "CRITICAL" : tick >= driftStart + 5 ? "WARNING" : "NORMAL",
        },
        cost_exposure: {
          total: totalCost,
          litigation: totalCost * 0.35,
          regulatory: totalCost * 0.28,
        },
        model_health: {
          status: overall && tick < driftStart + 5 ? "HEALTHY" : tick >= driftStart + 5 ? "DEGRADED" : "AT_RISK",
          uptime_pct: 99.7,
          predictions_today: tick * 127 + Math.floor(Math.random() * 150 + 50),
        },
      };

      setCurrent(snapshot);
      setHistory((prev) => [...prev.slice(-60), snapshot]);
    }, 2000);
  }, []);

  const connectWS = useCallback((d: string) => {
    wsRef.current?.close();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setHistory([]);
    setCurrent(null);
    setSimulationMode(false);

    try {
      const ws = connectFairnessMonitor(
        d,
        (data: MonitorSnapshot) => {
          setCurrent(data);
          setHistory((prev) => [...prev.slice(-60), data]);
        },
        () => {
          setConnected(false);
          // Fallback to simulation
          startSimulation();
        },
        () => setConnected(false)
      );
      ws.onopen = () => setConnected(true);
      wsRef.current = ws;

      // If WS doesn't connect in 3 seconds, fallback to simulation
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          startSimulation();
        }
      }, 3000);
    } catch {
      startSimulation();
    }
  }, [startSimulation]);

  useEffect(() => {
    connectWS(domain);
    return () => {
      wsRef.current?.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [domain, connectWS]);

  const chartData = history.map((s, i) => ({
    time: i,
    di: s.metrics.disparate_impact,
    dpd: s.metrics.dpd,
    eod: s.metrics.eod,
    fairness: s.metrics.fairness_score,
    cost: s.cost_exposure.total,
  }));

  return (
    <Layout>
      <div className="relative space-y-6 pb-10">
        {/* Header */}
        <div className="card-glow group relative overflow-hidden p-8">
          <div className={`absolute left-0 top-0 h-1 w-full ${
            current?.model_health?.status === "HEALTHY" ? "bg-emerald-500" :
            current?.model_health?.status === "DEGRADED" ? "bg-red-500 animate-pulse" :
            "bg-amber-500"
          }`} />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="relative">
                  <Radio className="h-6 w-6 text-primary" />
                  <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${
                    connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                  }`} />
                </div>
                <h1 className="font-sans text-3xl font-bold tracking-tight text-white">Real-Time Fairness Monitor</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Live fairness metrics updated every 2 seconds with CUSUM drift detection and compliance tracking.
                {simulationMode && " (Simulation Mode)"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={connected ? "HEALTHY" : "DEGRADED"} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setDomain("credit")}
                  className={domain === "credit" ? "bg-primary text-black" : "bg-white/5 text-white border border-white/10"}
                >
                  Credit
                </Button>
                <Button
                  size="sm"
                  onClick={() => setDomain("hiring")}
                  className={domain === "hiring" ? "bg-primary text-black" : "bg-white/5 text-white border border-white/10"}
                >
                  Hiring
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Status Cards */}
        {current && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="card-glow p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Model Health</p>
              <div className="mt-2"><StatusBadge status={current.model_health.status} /></div>
            </div>
            <div className="card-glow p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Compliance</p>
              <div className="mt-2"><StatusBadge status={current.compliance.status} /></div>
            </div>
            <div className="card-glow p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Drift Alert</p>
              <div className="mt-2"><StatusBadge status={current.drift.alert_level} /></div>
            </div>
            <div className="card-glow p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost Exposure</p>
              <p className={`mt-2 text-lg font-bold ${
                current.cost_exposure.total > 1000000 ? "text-red-400" : "text-emerald-400"
              }`}>{formatDollar(current.cost_exposure.total)}</p>
            </div>
            <div className="card-glow p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Predictions Today</p>
              <p className="mt-2 text-lg font-bold text-white">{current.model_health.predictions_today.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Real-time Metrics Gauges */}
        {current && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-glow p-5">
              <MetricGauge label="Disparate Impact (4/5ths Rule)" value={current.metrics.disparate_impact} threshold={0.80} />
            </div>
            <div className="card-glow p-5">
              <MetricGauge label="Demographic Parity Diff" value={current.metrics.dpd} threshold={0.10} inverse />
            </div>
            <div className="card-glow p-5">
              <MetricGauge label="Equalized Odds Diff" value={current.metrics.eod} threshold={0.10} inverse />
            </div>
            <div className="card-glow p-5">
              <MetricGauge label="Fairness Score" value={current.metrics.fairness_score / 100} threshold={0.80} />
            </div>
          </div>
        )}

        {/* Live Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Disparate Impact Timeline */}
          <div className="card-glow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Disparate Impact Over Time</h3>
                <p className="text-xs text-muted-foreground mt-0.5">4/5ths rule threshold at 0.80</p>
              </div>
              <div className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="diGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0.5, 1]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <ReferenceLine y={0.8} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: "4/5ths", fill: "#f59e0b", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="di" stroke="#3b82f6" strokeWidth={2} fill="url(#diGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost Exposure Timeline */}
          <div className="card-glow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Cost Exposure Over Time</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Real-time dollar impact tracking</p>
              </div>
              <div className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatDollar(v)} />
                  <Tooltip formatter={(v: number) => formatDollar(v)} contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} fill="url(#costGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Fairness Score Timeline */}
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Fairness Score & DPD Trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Combined fairness health over last {history.length} observations</p>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Fairness Score</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> DPD</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-purple-500" /> EOD</span>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="fairness" stroke="var(--chart-primary, #3b82f6)" strokeWidth={2} dot={false} name="Fairness Score" />
                <Line type="monotone" dataKey="dpd" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="DPD" />
                <Line type="monotone" dataKey="eod" stroke="#a855f7" strokeWidth={1.5} dot={false} name="EOD" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Layout>
  );
}
