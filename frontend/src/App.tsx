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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-right" theme="dark" />
    </ThemeProvider>
  );
}
