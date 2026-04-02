import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChangePassword } from "@/components/ChangePassword";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import SipTrunks from "./pages/SipTrunks";
import Extensions from "./pages/Extensions";
import ActiveCalls from "./pages/ActiveCalls";
import QualityMonitoring from "./pages/QualityMonitoring";
import Alerts from "./pages/Alerts";
import Countries from "./pages/Countries";
import IPBXManagement from "./pages/IPBXManagement";
import UserManagement from "./pages/UserManagement";
import Profile from "./pages/Profile";
import CountryDashboard from "./pages/CountryDashboard";
import NetworkMap from "./pages/NetworkMap";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const HomeRedirect = () => {
  const { isAdmin, canView } = useAuth();
  if (isAdmin || canView("dashboard")) return <Dashboard />;
  if (canView("dashboard_country")) return <Navigate to="/countries" replace />;
  return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Aucune vue autorisee</div>;
};

const ProtectedRoutes = () => {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") window.location.reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const { user, loading, isActive, forcePasswordChange, authReady, canView } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Chargement...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (loading || (user && !authReady)) return null;
  if (forcePasswordChange) {
    return <ChangePassword />;
  }
  if (!isActive) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-destructive">Compte desactive</p>
          <p className="text-sm text-muted-foreground">Contactez votre administrateur.</p>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-primary underline">Se deconnecter</button>
        </div>
      </div>
    );
  }

  const Guard = ({ view, element }: { view: string; element: JSX.Element }) => {
    if (canView(view)) return element;
    return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Acces non autorise</div>;
  };

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/sip-trunks" element={<Guard view="sip_trunks" element={<SipTrunks />} />} />
        <Route path="/extensions" element={<Guard view="extensions" element={<Extensions />} />} />
        <Route path="/calls" element={<Guard view="cdr" element={<ActiveCalls />} />} />
        <Route path="/quality" element={<Guard view="quality" element={<QualityMonitoring />} />} />
        <Route path="/alerts" element={<Guard view="alerts" element={<Alerts />} />} />
        <Route path="/countries" element={<Guard view="dashboard_country" element={<Countries />} />} />
        <Route path="/countries/:id" element={<Guard view="dashboard_country" element={<CountryDashboard />} />} />
        <Route path="/ipbx" element={<Guard view="settings" element={<IPBXManagement />} />} />
        <Route path="/network-map" element={<Guard view="network_map" element={<NetworkMap />} />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
};

const AuthRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
