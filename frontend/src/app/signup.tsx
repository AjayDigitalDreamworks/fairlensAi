"use client";

import { Button } from "@/components/ui/button";
import { getAuthToken, signupAccount } from "@/lib/auth";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthShell } from "@/app/login";

export default function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/dashboard";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getAuthToken()) navigate(from, { replace: true });
  }, [from, navigate]);

  if (getAuthToken()) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await signupAccount({ name, email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Set up your secure FairLens workspace."
      footerText="Already have an account?"
      footerLink="/login"
      footerLinkText="Log in"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Full Name</label>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
            required
          />
        </div>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-[0.3em] text-primary">Confirm</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
              required
              minLength={8}
            />
          </div>
        </div>
        {error && <div className="border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        <Button type="submit" disabled={loading} className="w-full bg-primary py-6 font-bold text-black hover:bg-primary/90">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Create Account
          {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </form>
    </AuthShell>
  );
}
