import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Network,
  Phone,
  PhoneCall,
  Activity,
  Bell,
  Shield,
  Globe,
  Server,
  Users,
  LogOut,
  Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const AppSidebar = () => {
  const location = useLocation();
  const { isAdmin, user, signOut, canView } = useAuth();

  const navItems = [
    { to: "/",            icon: LayoutDashboard, label: "Dashboard",    show: isAdmin || canView("dashboard"),        section: "menu" },
    { to: "/network-map", icon: Map,             label: "Network Map",  show: isAdmin || canView("network_map"),      section: "menu" },
    { to: "/countries",   icon: Globe,           label: "Pays",         show: canView("dashboard_country"),           section: "menu" },
    { to: "/ipbx",        icon: Server,          label: "IPBX",         show: canView("settings"),                    section: "menu" },
    { to: "/sip-trunks",  icon: Network,         label: "SIP Trunks",   show: canView("sip_trunks"),                  section: "menu" },
    { to: "/extensions",  icon: Phone,           label: "Extensions",   show: canView("extensions"),                  section: "menu" },
    { to: "/calls",       icon: PhoneCall,       label: "Appels",       show: canView("cdr"),                         section: "menu" },
    { to: "/quality",     icon: Activity,        label: "Qualité VoIP", show: canView("quality"),                     section: "general" },
    { to: "/alerts",      icon: Bell,            label: "Alertes",      show: canView("alerts"),                      section: "general" },
    { to: "/users",       icon: Users,           label: "Utilisateurs", show: isAdmin,                                section: "general" },
  ];

  const menuItems    = navItems.filter(i => i.show && i.section === "menu");
  const generalItems = navItems.filter(i => i.show && i.section === "general");

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen w-60 flex flex-col bg-card border-r border-border"
      style={{ fontFamily: "'Raleway', sans-serif" }}
    >
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <img src="/GVOIP.png" alt="GVoIP" className="w-9 h-9 object-contain shrink-0" />
          <h1
            className="text-lg font-black text-foreground tracking-wide"
            style={{ fontFamily: "'Raleway', sans-serif" }}
          >
            G<span style={{ color: "#1A4D2E" }} className="dark:text-emerald-400">VoIP</span>
          </h1>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin space-y-4">

        {/* Section MENU */}
        {menuItems.length > 0 && (
          <div>
            <p className="px-3 mb-2 text-[9px] font-black tracking-[1.5px] uppercase text-muted-foreground">
              Menu
            </p>
            <div className="space-y-0.5">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200",
                      isActive
                        ? "text-[#1A4D2E] dark:text-emerald-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted/30"
                    )}
                    style={
                      isActive
                        ? { background: "rgba(26,77,46,.10)" }
                        : undefined
                    }
                  >
                    {/* Active left bar */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                        style={{ background: "#1A4D2E" }}
                      />
                    )}
                    <item.icon
                      size={16}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={isActive ? "text-[#1A4D2E] dark:text-emerald-400" : "text-muted-foreground"}
                    />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}

        {/* Section GENERAL */}
        {generalItems.length > 0 && (
          <div>
            <p className="px-3 mb-2 text-[9px] font-black tracking-[1.5px] uppercase text-muted-foreground">
              Général
            </p>
            <div className="space-y-0.5">
              {generalItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200",
                      isActive
                        ? "text-[#1A4D2E] dark:text-emerald-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted/30"
                    )}
                    style={
                      isActive
                        ? { background: "rgba(26,77,46,.10)" }
                        : undefined
                    }
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                        style={{ background: "#1A4D2E" }}
                      />
                    )}
                    <item.icon
                      size={16}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={isActive ? "text-[#1A4D2E] dark:text-emerald-400" : "text-muted-foreground"}
                    />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">Système opérationnel</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Shield size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground font-medium truncate">
              {user?.email || "—"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 hover:bg-red-500/10 hover:text-red-500 transition-colors rounded-lg"
            onClick={signOut}
            title="Déconnexion"
          >
            <LogOut size={12} />
          </Button>
        </div>
      </div>
    </aside>
  );
};

export { AppSidebar };
