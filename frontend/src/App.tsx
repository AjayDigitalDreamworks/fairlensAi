import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "@/app/page";
import LoginPage from "@/app/login";
import SignupPage from "@/app/signup";
import AnalyzerPage from "@/app/analyzer/page";
import DashboardPage from "@/app/dashboard/page";
import ExplainabilityPage from "@/app/explainability/page";
import MetricsPage from "@/app/metrics/page";
import MitigationPage from "@/app/mitigation/page";
import ReportsPage from "@/app/reports/page";
import SettingsPage from "@/app/settings/page";
import ModelDashboardPage from "@/app/model-dashboard/page";
import ModelAnalyzerPage from "@/app/model-analyzer/page";
import ModelExplainabilityPage from "@/app/model-explainability/page";
import ModelMetricsPage from "@/app/model-metrics/page";
import ModelMitigationPage from "@/app/model-mitigation/page";
import ModelReportsPage from "@/app/model-reports/page";
import CostCalculatorPage from "@/app/cost-calculator/page";
import ComplianceDashboardPage from "@/app/compliance/page";
import RealtimeMonitorPage from "@/app/realtime-monitor/page";
import SimulatorPage from "@/app/simulator/page";
import PreventionPage from "@/app/prevention";
import CertificationPage from "@/app/certification";

export default function App() {
  const protect = (element: ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;

  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/analyzer" element={protect(<AnalyzerPage />)} />
        <Route path="/dashboard" element={protect(<DashboardPage />)} />
        <Route path="/explainability" element={protect(<ExplainabilityPage />)} />
        <Route path="/metrics" element={protect(<MetricsPage />)} />
        <Route path="/mitigation" element={protect(<MitigationPage />)} />
        <Route path="/reports" element={protect(<ReportsPage />)} />
        <Route path="/settings" element={protect(<SettingsPage />)} />
        <Route path="/model-dashboard" element={protect(<ModelDashboardPage />)} />
        <Route path="/model-analyzer" element={protect(<ModelAnalyzerPage />)} />
        <Route path="/model-explainability" element={protect(<ModelExplainabilityPage />)} />
        <Route path="/model-metrics" element={protect(<ModelMetricsPage />)} />
        <Route path="/model-mitigation" element={protect(<ModelMitigationPage />)} />
        <Route path="/model-reports" element={protect(<ModelReportsPage />)} />
        <Route path="/cost-calculator" element={protect(<CostCalculatorPage />)} />
        <Route path="/compliance" element={protect(<ComplianceDashboardPage />)} />
        <Route path="/realtime-monitor" element={protect(<RealtimeMonitorPage />)} />
        <Route path="/simulator" element={protect(<SimulatorPage />)} />
        <Route path="/prevention" element={protect(<PreventionPage />)} />
        <Route path="/certification" element={protect(<CertificationPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-right" theme="dark" />
    </ThemeProvider>
  );
}
