import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Settings,
  FileText,
  Menu,
  X,
  Home,
  Zap,
  Shield,
  LogOut,
} from "lucide-react";
import { Button } from "./ui/button";

import ThemeToggle from "./ThemeToggle";

const sidebarItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Dataset Analyzer", href: "/analyzer", icon: BarChart3 },
  { name: "Fairness Metrics", href: "/metrics", icon: Shield },
  { name: "Mitigation Toolkit", href: "/mitigation", icon: Zap },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex relative">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-primary/10 bg-black/80 backdrop-blur-2xl transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ borderRadius: '0 var(--theme-border-radius) var(--theme-border-radius) 0' }}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 flex items-center justify-center text-primary font-bold text-sm border border-primary/50 bg-primary/10 shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" style={{ borderRadius: 'var(--theme-border-radius)' }}>
              F
            </div>
            <span className="text-lg font-bold glow-text">FairAI</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 px-4 py-6">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-300 border-l-2 ${
                  isActive
                    ? "bg-primary/10 text-primary border-primary shadow-[inset_10px_0_20px_-10px_rgba(var(--theme-glow),0.3)]"
                    : "text-muted-foreground border-transparent hover:bg-white/5 hover:text-white hover:border-primary/30"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4 space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-white hover:bg-white/5 transition-all duration-300"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full lg:pl-64">
        {/* Top Navigation */}
        <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-secondary"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <div className="text-sm text-muted-foreground hidden sm:block">
                {pathname === "/analyzer" ? "Automated audit queue" : "Fairness operations hub"}
              </div>
              <div className="h-8 w-8 border border-primary/50 bg-primary/10 flex items-center justify-center text-primary font-bold text-xs" style={{ borderRadius: 'var(--theme-border-radius)' }}>
                U
              </div>
            </div>
          </div>
        </header>


        {/* Page Content */}
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
