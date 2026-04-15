import { fetchCurrentUser, getAuthToken, subscribeAuthChange } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "allowed" | "blocked">(() =>
    getAuthToken() ? "checking" : "blocked",
  );

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeAuthChange(() => {
      if (!getAuthToken()) setStatus("blocked");
    });

    if (!getAuthToken()) {
      setStatus("blocked");
      return unsubscribe;
    }

    fetchCurrentUser()
      .then(() => {
        if (mounted) setStatus("allowed");
      })
      .catch(() => {
        if (mounted) setStatus("blocked");
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [location.pathname]);

  if (status === "blocked") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="card-glow flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Checking secure session...
        </div>
      </div>
    );
  }

  return children;
}
