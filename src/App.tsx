import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ClientAuthProvider } from "@/hooks/useClientAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminAuth from "./pages/AdminAuth";
import NotFound from "./pages/NotFound";
import ClientPublicView from "./pages/ClientPublicView";
import ClientPortal from "./pages/ClientPortal";
import MasterArt from "./pages/MasterArt";
import MasterVideo from "./pages/MasterVideo";
import Receivables from "./pages/Receivables";
import BatchHistoryPage from "./pages/BatchHistoryPage";
import ExportDatabase from "./pages/ExportDatabase";
import SendMedia from "./pages/SendMedia";
import { useKeepAlive } from "@/hooks/useKeepAlive";
import "./App.css";

const queryClient = new QueryClient();

const KeepAliveProvider = ({ children }: { children: React.ReactNode }) => {
  useKeepAlive();
  return <>{children}</>;
};

const App = () => (
  <KeepAliveProvider>
  <ClientAuthProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/master-art" element={<ProtectedRoute><MasterArt /></ProtectedRoute>} />
          <Route path="/master-video" element={<ProtectedRoute><MasterVideo /></ProtectedRoute>} />
          <Route path="/batch-history" element={<ProtectedRoute><BatchHistoryPage /></ProtectedRoute>} />
          <Route path="/receivables" element={<ProtectedRoute><Receivables /></ProtectedRoute>} />
          <Route path="/export-db" element={<ProtectedRoute><ExportDatabase /></ProtectedRoute>} />
          <Route path="/send-media" element={<ProtectedRoute><SendMedia /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminAuth />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/portal" element={<ClientPortal />} />
          <Route path="/client/:clientId" element={<ClientPublicView />} />
          <Route path="/:clientSlug" element={<ClientPublicView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ClientAuthProvider>
  </KeepAliveProvider>
);

export default App;
