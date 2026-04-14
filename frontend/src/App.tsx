import { Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/app/page";
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

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/analyzer" element={<AnalyzerPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/explainability" element={<ExplainabilityPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route path="/mitigation" element={<MitigationPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/model-dashboard" element={<ModelDashboardPage />} />
        <Route path="/model-analyzer" element={<ModelAnalyzerPage />} />
        <Route path="/model-explainability" element={<ModelExplainabilityPage />} />
        <Route path="/model-metrics" element={<ModelMetricsPage />} />
        <Route path="/model-mitigation" element={<ModelMitigationPage />} />
        <Route path="/model-reports" element={<ModelReportsPage />} />
        <Route path="/cost-calculator" element={<CostCalculatorPage />} />
        <Route path="/compliance" element={<ComplianceDashboardPage />} />
        <Route path="/realtime-monitor" element={<RealtimeMonitorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-right" theme="dark" />
    </ThemeProvider>
  );
}
