"use client";

import {
  Copy, Eye, EyeOff, Trash2, Save, Bell, Lock, Users,
  Terminal, ShieldCheck, ShieldAlert, Key, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import { useState } from "react";

export default function Settings() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const tabs = [
    { id: "general", label: "Profile", icon: Users },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security & API Keys", icon: Lock },
  ];

  const apiKeys = [
    {
      id: 1,
      name: "Production API Key",
      key: "fai_live_7d9c3f2a1e8b4c5f9a2k",
      created: "Jan 15, 2024",
      lastUsed: "2 hours ago",
    },
    {
      id: 2,
      name: "Development API Key",
      key: "fai_test_1a2b3c4d5e6f7g8h9i0j",
      created: "Dec 20, 2023",
      lastUsed: "3 days ago",
    },
  ];

  const notificationSettings = [
    { id: "bias_alerts", label: "Bias Alerts", description: "Get notified when fairness scores drop below threshold", enabled: true },
    { id: "report_ready", label: "Report Ready", description: "Notification when an audit report is completed", enabled: true },
    { id: "compliance_warning", label: "Compliance Warnings", description: "Alerts when compliance scores deviate significantly", enabled: false },
    { id: "weekly_digest", label: "Weekly Summary", description: "Weekly digest of all fairness audit activity", enabled: true },
  ];

  return (
    <Layout>
      <div className="space-y-8 relative overflow-hidden pb-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 blur-[120px] pointer-events-none"></div>

        {/* Header */}
        <div className="card-glow p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
          <h1 className="text-3xl font-bold text-white mb-2 font-sans tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your profile, notification preferences, and API access keys.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/5 pb-0 relative z-10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-8 py-5 text-sm font-medium transition-all relative overflow-hidden ${
                  activeTab === tab.id
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-white/40 hover:text-white hover:bg-white/5 border-b-2 border-transparent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Section */}
        <div>
          {/* General Tab */}
          {activeTab === "general" && (
            <div className="space-y-8">
              {/* Profile Card */}
              <div className="card-glow p-10 space-y-8 border-emerald-500/20">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-3">
                  <Users className="w-4 h-4 text-emerald-500" />
                  Profile Information
                </h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">Full Name</label>
                    <input
                      type="text"
                      defaultValue="Anshul Mangla"
                      className="w-full bg-black/40 border border-white/10 px-4 py-3.5 text-sm text-white focus:border-emerald-500/40 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">Email</label>
                    <input
                      type="email"
                      defaultValue="anshul@fairlens.dev"
                      className="w-full bg-black/40 border border-white/10 px-4 py-3.5 text-sm text-white focus:border-emerald-500/40 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">Organization</label>
                    <input
                      type="text"
                      defaultValue="FairLens AI Inc."
                      className="w-full bg-black/40 border border-white/10 px-4 py-3.5 text-sm text-white focus:border-emerald-500/40 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">Plan</label>
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium flex items-center justify-between">
                       <span>Professional</span>
                       <span className="text-xs text-muted-foreground">Renews Jan 15, 2025</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full md:w-auto bg-primary text-black font-semibold px-8 py-6 rounded-none hover:bg-primary/90 transition-all border border-primary/40">
                  <Save className="h-4 w-4 mr-3" />
                  Save Changes
                </Button>
              </div>

              {/* Danger Zone */}
              <div className="card-glow border border-red-500/20 bg-red-500/5 p-10 relative overflow-hidden">
                <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide flex items-center gap-3 mb-6">
                  <ShieldAlert className="w-4 h-4" />
                  Danger Zone
                </h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
                  These actions are permanent and cannot be undone. Deleting your account will remove all audit data, reports, and settings.
                </p>
                <Button variant="outline" className="border-red-500/20 text-red-500 px-10 py-6 rounded-none hover:bg-red-500/10 transition-all">
                  Delete Account
                </Button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="card-glow p-10 space-y-10 border-emerald-500/20">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-3">
                <Bell className="w-4 h-4 text-emerald-500" />
                Notification Preferences
              </h2>

              <div className="space-y-4">
                {notificationSettings.map((setting) => (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between p-6 bg-black/40 border border-white/5 hover:border-emerald-500/30 transition-all group"
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">
                        {setting.label}
                      </h3>
                      <p className="text-xs text-muted-foreground">
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

              <Button className="w-full md:w-auto bg-primary text-black font-semibold px-8 py-6 rounded-none hover:bg-primary/90 transition-all border border-primary/40">
                <Save className="h-4 w-4 mr-3" />
                Save Preferences
              </Button>
            </div>
          )}

          {/* Security & API Tab */}
          {activeTab === "security" && (
            <div className="space-y-8">
              {/* API Keys */}
              <div className="card-glow p-10 space-y-10 border-secondary/20">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-3">
                  <Key className="w-4 h-4 text-secondary" />
                  API Keys
                </h2>

                <div className="space-y-6">
                  {apiKeys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="p-6 bg-black/40 border border-white/5 hover:border-teal-500/20 transition-all group relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-6">
                        <div className="space-y-1">
                          <h3 className="text-sm font-medium text-white group-hover:text-teal-400 transition-colors">
                            {apiKey.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Created: <span className="text-white/60">{apiKey.created}</span> · Last used: <span className="text-teal-400">{apiKey.lastUsed}</span>
                          </p>
                        </div>
                        <button className="p-2 border border-white/5 bg-white/2 hover:bg-red-500/10 transition-colors text-white/20 hover:text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                           <Terminal className="absolute left-4 top-3.5 w-3.5 h-3.5 text-teal-500/40" />
                           <code className="block w-full bg-black/60 border border-white/5 px-12 py-3.5 text-xs font-mono text-teal-100 overflow-hidden text-ellipsis">
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

                <Button className="bg-teal-500/10 border border-teal-500/30 text-teal-400 text-sm px-10 py-6 rounded-none hover:bg-teal-500/20 transition-all h-auto">
                   Generate New API Key
                </Button>
              </div>

              {/* 2FA */}
              <div className="card-glow p-10 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border-emerald-500/20">
                <div className="flex flex-col md:flex-row gap-8 items-center md:items-start text-center md:text-left">
                  <div className="p-5 bg-primary/10 border border-primary/20 h-fit">
                    <ShieldCheck className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <h3 className="text-xl font-bold text-white">Two-Factor Authentication</h3>
                    <p className="text-sm text-muted-foreground max-w-xl mx-auto md:mx-0">
                      Add an extra layer of security to your account. Two-factor authentication helps protect your audit data from unauthorized access.
                    </p>
                    <Button variant="outline" className="border-primary/30 text-primary text-sm px-12 py-6 rounded-none hover:bg-primary/10 transition-all">
                      Enable 2FA
                    </Button>
                  </div>
                </div>
              </div>

              {/* Login History */}
              <div className="card-glow p-10 space-y-8 border-white/5">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-white/40" />
                  Recent Login Activity
                </h2>
                <div className="space-y-4">
                  {[
                    { device: "Chrome / macOS", location: "US West", time: "2 hours ago", status: "Active" },
                    { device: "Safari / iOS", location: "US West", time: "1 day ago", status: "Inactive" },
                    { device: "Firefox / Windows", location: "US East", time: "1 week ago", status: "Inactive" },
                  ].map((login, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-5 bg-black/40 border border-white/5 group hover:bg-white/5 transition-all"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">
                          {login.device}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {login.location} · {login.time}
                        </p>
                      </div>
                      <span className={`px-4 py-1 border text-xs font-medium ${
                        login.status === 'Active' ? 'border-primary/40 text-primary bg-primary/5' : 'border-white/10 text-white/20'
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
