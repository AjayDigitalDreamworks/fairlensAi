import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "The interface hit an unexpected error.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FairLens UI error", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto mt-24 max-w-2xl border border-red-500/30 bg-red-500/10 p-8">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {this.state.message}
          </p>
          <button
            className="mt-6 border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            onClick={() => window.location.reload()}
          >
            Reload FairLens
          </button>
        </div>
      </div>
    );
  }
}
