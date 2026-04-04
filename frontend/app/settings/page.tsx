"use client";

import { 
  Copy, Eye, EyeOff, Trash2, Save, Bell, Lock, Users, 
  Terminal, ShieldCheck, ShieldAlert, Cpu, Key, ChevronRight, Check, X, RefreshCw 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import { useState } from "react";

export default function Settings() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const tabs = [
    { id: "general", label: "General Protocol", icon: Users },
    { id: "notifications", label: "Signal Alerts", icon: Bell },
    { id: "security", label: "Neural Security", icon: Lock },
  ];

  const apiKeys = [
    {
      id: 1,
      name: "Production Access Node",
      key: "fai_live_7d9c3f2a1e8b4c5f9a2k",
      created: "JAN 15, 2024",
      lastUsed: "2 HOURS AGO",
    },
    {
      id: 2,
      name: "Development Sandbox",
      key: "fai_test_1a2b3c4d5e6f7g8h9i0j",
      created: "DEC 20, 2023",
      lastUsed: "3 DAYS AGO",
    },
  ];

  const notificationSettings = [
    { id: "bias_alerts", label: "Bias Drift Signals", description: "Real-time alerts when parity scores drop below threshold", enabled: true },
    { id: "report_ready", label: "Audit Log Ready", description: "Notification when structural audit completes", enabled: true },
    { id: "compliance_warning", label: "Regulatory Alerts", description: "Warnings when compliance fidelity deviates", enabled: false },
    { id: "weekly_digest", label: "Weekly Neural Digest", description: "Summary of multi-dimensional fairness metrics", enabled: true },
  ];

  return (
    <Layout>
      <div className="space-y-8 relative overflow-hidden pb-12">
        {/* Background Haze */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 blur-[120px] pointer-events-none"></div>

        {/* Header */}
        <div className="card-glow p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
          <h1 className="text-3xl font-bold text-white mb-2 font-sans tracking-tight">System Parameters</h1>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground opacity-60">
            Manage operator identity, access nodes, and neural preferences...
          </p>
        </div>

        {/* Tactical Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/5 pb-0 relative z-10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative overflow-hidden ${
                  activeTab === tab.id
                    ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]"
                    : "text-white/40 hover:text-white hover:bg-white/5 border-b-2 border-transparent"
                }`}
              >
                <Icon className={`h-4 w-4 ${activeTab === tab.id ? 'animate-pulse' : ''}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Section */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* General Tab */}
          {activeTab === "general" && (
            <div className="space-y-8">
              {/* Profile Card */}
              <div className="card-glow p-10 space-y-8 border-emerald-500/20">
                <h2 className="text-[11px] font-bold text-white uppercase tracking-[0.3em] flex items-center gap-3">
                  <Cpu className="w-4 h-4 text-emerald-500" />
                  <div className="w-1.5 h-4 bg-emerald-500"></div>
                  Operator Identity Matrix
                </h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-mono tracking-widest text-emerald-400 font-black opacity-80">Full Name</label>
                    <input
                      type="text"
                      defaultValue="Anshul Mangla"
                      className="w-full bg-black/40 border border-white/10 px-4 py-3.5 text-xs font-mono text-emerald-100 focus:border-emerald-500/40 outline-none transition-all uppercase tracking-widest"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-mono tracking-widest text-emerald-400 font-black opacity-80">Sync Email</label>
                    <input
                      type="email"
                      defaultValue="anshul@fairai.dev"
                      className="w-full bg-black/40 border border-white/10 px-4 py-3.5 text-xs font-mono text-emerald-100 focus:border-emerald-500/40 outline-none transition-all uppercase tracking-widest"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-mono tracking-widest text-emerald-400 font-black opacity-80">Assigned Organization</label>
                    <input
                      type="text"
                      defaultValue="FairAI Inc."
                      className="w-full bg-black/40 border border-white/10 px-4 py-3.5 text-xs font-mono text-emerald-100 focus:border-emerald-500/40 outline-none transition-all uppercase tracking-widest"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-mono tracking-widest text-emerald-400 font-black opacity-80">Operational Tier</label>
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] uppercase font-bold flex items-center justify-between">
                       <span>Pro Neural Suite</span>
                       <span className="opacity-40">Renews Jan 15, 2025</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full md:w-auto bg-emerald-500 text-black font-bold uppercase tracking-[0.4em] text-[10px] px-12 py-8 rounded-none shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:brightness-110 transition-all border border-emerald-400">
                  <Save className="h-4 w-4 mr-3" />
                  Commit Identity Shifts
                </Button>
              </div>

              {/* Danger Zone Card */}
              <div className="card-glow border border-red-500/20 bg-red-500/5 p-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 blur-3xl pointer-events-none"></div>
                <h2 className="text-[11px] font-bold text-red-400 uppercase tracking-[0.3em] flex items-center gap-3 mb-6">
                  <ShieldAlert className="w-4 h-4" />
                  Critical Protocol Reset
                </h2>
                <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mb-8 opacity-70 leading-relaxed max-w-2xl">
                  These actions will permanently terminate core identity data and neural archives. Irreversible after execution.
                </p>
                <Button variant="outline" className="border-red-500/20 text-red-500 font-mono text-[9px] uppercase font-black px-10 py-6 rounded-none hover:bg-red-500/10 transition-all">
                  Terminate Global Instance
                </Button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="card-glow p-10 space-y-10 border-emerald-500/20">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-[0.3em] flex items-center gap-3">
                <Bell className="w-4 h-4 text-emerald-500" />
                <div className="w-1.5 h-4 bg-emerald-500"></div>
                Signal Logic Configuration
              </h2>

              <div className="space-y-4">
                {notificationSettings.map((setting) => (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between p-6 bg-black/40 border border-white/5 hover:border-emerald-500/30 transition-all group"
                  >
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
                        {setting.label}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-tighter opacity-60">
                        {setting.description}
                      </p>
                    </div>
                    <div className={`w-12 h-6 rounded-full flex items-center px-1.5 cursor-pointer transition-all ${
                      setting.enabled ? "bg-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "bg-white/10"
                    }`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${
                        setting.enabled ? "ml-auto" : "ml-0"
                      }`} />
                    </div>
                  </div>
                ))}
              </div>

              <Button className="w-full md:w-auto bg-emerald-500 text-black font-bold uppercase tracking-[0.4em] text-[10px] px-12 py-8 rounded-none shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:brightness-110 transition-all border border-emerald-400">
                <Save className="h-4 w-4 mr-3" />
                Update Signal Logic
              </Button>
            </div>
          )}

          {/* Security & API Tab */}
          {activeTab === "security" && (
            <div className="space-y-8">
              {/* API Access Nodes */}
              <div className="card-glow p-10 space-y-10 border-teal-500/20">
                <h2 className="text-[11px] font-bold text-white uppercase tracking-[0.3em] flex items-center gap-3">
                  <Key className="w-4 h-4 text-teal-400" />
                  <div className="w-1.5 h-4 bg-teal-500"></div>
                  Neural Access Keyrings
                </h2>

                <div className="space-y-6">
                  {apiKeys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="p-6 bg-black/40 border border-white/5 hover:border-teal-500/20 transition-all group relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-6">
                        <div className="space-y-1">
                          <h3 className="text-xs font-bold text-white uppercase tracking-widest group-hover:text-teal-400 transition-colors">
                            {apiKey.name}
                          </h3>
                          <p className="text-[9px] font-mono text-muted-foreground uppercase opacity-60 tracking-widest">
                            Sync Point: <span className="text-white/60">{apiKey.created}</span> • Last Signal: <span className="text-teal-500/80 font-black">{apiKey.lastUsed}</span>
                          </p>
                        </div>
                        <button className="p-2 border border-white/5 bg-white/2 hover:bg-red-500/10 transition-colors text-white/20 hover:text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative group/key">
                           <Terminal className="absolute left-4 top-3.5 w-3.5 h-3.5 text-teal-500/40" />
                           <code className="block w-full bg-black/60 border border-white/5 px-12 py-3.5 text-[10px] font-mono tracking-widest text-teal-100 overflow-hidden text-ellipsis">
                             {showApiKey ? apiKey.key : "•".repeat(24)}
                           </code>
                        </div>
                        <div className="flex gap-2">
                           <button
                             onClick={() => setShowApiKey(!showApiKey)}
                             className="p-3.5 bg-white/2 border border-white/5 text-muted-foreground hover:text-teal-400 hover:border-teal-500/30 transition-all"
                           >
                             {showApiKey ? (
                               <EyeOff className="h-4 w-4" />
                             ) : (
                               <Eye className="h-4 w-4" />
                             )}
                           </button>
                           <button className="p-3.5 bg-white/2 border border-white/5 text-muted-foreground hover:text-teal-400 hover:border-teal-500/30 transition-all">
                             <Copy className="h-4 w-4" />
                           </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button className="bg-teal-500/10 border border-teal-500/30 text-teal-400 font-mono text-[9px] uppercase font-black px-10 py-6 rounded-none hover:bg-teal-500/20 transition-all shadow-[0_0_15px_rgba(20,184,166,0.1)] h-auto">
                   Generate New Access Node
                </Button>
              </div>

              {/* 2FA Card */}
              <div className="card-glow p-10 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border-emerald-500/20">
                <div className="flex flex-col md:flex-row gap-8 items-center md:items-start text-center md:text-left">
                  <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 h-fit">
                    <ShieldCheck className="h-8 w-8 text-emerald-400" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wide">Multi-Sign Neural Verification</h3>
                    <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest opacity-70 leading-relaxed max-w-xl mx-auto md:mx-0">
                      Inject an secondary layer of identity verification to all sensitive command cycles. Restricts unauthorized operational shifts.
                    </p>
                    <Button variant="outline" className="border-emerald-500/30 text-emerald-400 font-mono text-[10px] uppercase font-black px-12 py-6 rounded-none hover:bg-emerald-500/10 transition-all">
                      Initialize 2FA Protocol
                    </Button>
                  </div>
                </div>
              </div>

              {/* Login Matrix Table */}
              <div className="card-glow p-10 space-y-8 border-white/5">
                <h2 className="text-[11px] font-bold text-white uppercase tracking-[0.3em] flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-white/40" />
                  Operator Access Matrix
                </h2>
                <div className="space-y-4">
                  {[
                    { device: "Chrome Engine / OSX", location: "US-WEST-CA", time: "2 HOURS AGO", status: "Active Session" },
                    { device: "Safari Mobile / iOS", location: "US-WEST-CA", time: "1 DAY AGO", status: "Inactive" },
                    { device: "Win-WSL / Hyper-V", location: "US-EAST-NY", time: "1 WEEK AGO", status: "Inactive" },
                  ].map((login, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-5 bg-black/40 border border-white/5 group hover:bg-white/5 transition-all"
                    >
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-white uppercase tracking-[0.3em] group-hover:text-emerald-400 transition-colors">
                          {login.device}
                        </p>
                        <p className="text-[9px] font-mono text-muted-foreground uppercase opacity-60 tracking-widest">
                          EP: {login.location} • TS: {login.time}
                        </p>
                      </div>
                      <span className={`px-4 py-1 border font-mono text-[9px] font-black uppercase ${
                        login.status === 'Active Session' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' : 'border-white/10 text-white/20'
                      }`}>
                        {login.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
