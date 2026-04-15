"use client";

import { Button } from "@/components/ui/button";
import { getAuthToken, loginAccount } from "@/lib/auth";
import { ArrowRight, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getAuthToken()) navigate(from, { replace: true });
  }, [from, navigate]);

  if (getAuthToken()) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await loginAccount({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to access your FairLens audit workspace."
      footerText="New to FairLens?"
      footerLink="/signup"
      footerLinkText="Create account"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
            required
          />
        </div>
        {error && <div className="border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        <Button type="submit" disabled={loading} className="w-full bg-primary py-6 font-bold text-black hover:bg-primary/90">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
          Log In
          {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  footerText,
  footerLink,
  footerLinkText,
  children,
}: {
  title: string;
  subtitle: string;
  footerText: string;
  footerLink: string;
  footerLinkText: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 pointer-events-none bg-grid opacity-20" />
      <main className="relative z-10 mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-primary/50 bg-primary/10 font-bold text-primary">F</div>
            <span className="text-2xl font-bold glow-text">FairLens AI</span>
          </Link>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure Workspace
            </div>
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-white sm:text-5xl">
              Fairness audits stay behind your account.
            </h1>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">
              Every dashboard, report, model run, and compliance artifact now requires an authenticated session.
            </p>
          </div>
        </section>

        <section className="card-glow p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {footerText}{" "}
            <Link to={footerLink} className="font-semibold text-primary hover:text-primary/80">
              {footerLinkText}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
