import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Network, Phone, PhoneCall, Activity,
  Bell, Shield, Globe, Server, Users, LogOut, Map,
  Moon, Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Dark mode hook ─────────────────────────────────────── */
const useDarkMode = () => {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);
  return { dark, toggle };
};

/* ── Live clock ─────────────────────────────────────────── */
const useClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

/* ═══════════════════════════════════════════════════════════
   TOPBAR — exporté séparément pour usage dans Layout.tsx
═══════════════════════════════════════════════════════════ */
export const AppTopbar = () => {
  const { dark, toggle } = useDarkMode();
  const now = useClock();

  const dateStr = now.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <div
      className="flex items-center justify-end gap-3 px-4 py-2.5"
      style={{ fontFamily: "'Raleway', sans-serif" }}
    >
      {/* Date + heure */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border shadow-sm">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="2" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" className="text-muted-foreground"/>
          <path d="M4 1v2M9 1v2M1 5.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-muted-foreground"/>
        </svg>
        <span className="text-[11px] font-bold text-muted-foreground font-mono tracking-wide">
          {dateStr}
        </span>
        <span className="w-px h-3 bg-border" />
        <span className="text-[11px] font-bold text-foreground font-mono tracking-wide">
          {timeStr}
        </span>
        {/* Indicateur actif */}
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
      </div>

      {/* Toggle dark/light */}
      <button
        onClick={toggle}
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-200",
          "bg-card border-border hover:border-primary/40 hover:bg-accent",
          "shadow-sm"
        )}
        title={dark ? "Mode clair" : "Mode sombre"}
      >
        {dark
          ? <Sun size={14} className="text-amber-400" />
          : <Moon size={14} className="text-muted-foreground" />
        }
      </button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   SIDEBAR FLOTTANTE
═══════════════════════════════════════════════════════════ */
const AppSidebar = () => {
  const location = useLocation();
  const { isAdmin, user, signOut, canView } = useAuth();

  const navItems = [
    { to: "/",            icon: LayoutDashboard, label: "Dashboard",    show: isAdmin || canView("dashboard"),   section: "menu" },
    { to: "/network-map", icon: Map,             label: "Network Map",  show: isAdmin || canView("network_map"), section: "menu" },
    { to: "/countries",   icon: Globe,           label: "Pays",         show: canView("dashboard_country"),      section: "menu" },
    { to: "/ipbx",        icon: Server,          label: "IPBX",         show: canView("settings"),               section: "menu" },
    { to: "/sip-trunks",  icon: Network,         label: "SIP Trunks",   show: canView("sip_trunks"),             section: "menu" },
    { to: "/extensions",  icon: Phone,           label: "Extensions",   show: canView("extensions"),             section: "menu" },
    { to: "/calls",       icon: PhoneCall,       label: "Appels",       show: canView("cdr"),                    section: "menu" },
    { to: "/quality",     icon: Activity,        label: "Qualité VoIP", show: canView("quality"),                section: "general" },
    { to: "/alerts",      icon: Bell,            label: "Alertes",      show: canView("alerts"),                 section: "general" },
    { to: "/users",       icon: Users,           label: "Utilisateurs", show: isAdmin,                           section: "general" },
  ];

  const menuItems    = navItems.filter(i => i.show && i.section === "menu");
  const generalItems = navItems.filter(i => i.show && i.section === "general");

  return (
    /*
      FLOATING SIDEBAR :
      - fixed avec margin (top/left/bottom) pour l'effet "flottant"
      - border-radius sur tout le sidebar
      - box-shadow pour l'élévation
      - border fine
    */
    <aside
      className="fixed left-3 top-3 bottom-3 z-40 w-56 flex flex-col bg-card border border-border"
      style={{
        fontFamily: "'Raleway', sans-serif",
        borderRadius: "18px",
        boxShadow: "0 4px 24px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04)",
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src="/GVOIP.png" alt="GVoIP" className="w-8 h-8 object-contain shrink-0" />
          <h1 className="text-base font-black text-foreground tracking-wide">
            G<span className="text-primary">VoIP</span>
          </h1>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto scrollbar-thin space-y-3">

        {/* MENU */}
        {menuItems.length > 0 && (
          <div>
            <p className="px-3 mb-1.5 text-[9px] font-black tracking-[1.5px] uppercase text-muted-foreground">
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
                      "relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all duration-200",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted/30"
                    )}
                    style={isActive ? {
                      background: "hsl(var(--primary) / 0.10)",
                    } : undefined}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{ background: "hsl(var(--primary))" }}
                      />
                    )}
                    <item.icon
                      size={15}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={isActive ? "text-primary" : "text-muted-foreground"}
                    />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}

        {/* GÉNÉRAL */}
        {generalItems.length > 0 && (
          <div>
            <p className="px-3 mb-1.5 text-[9px] font-black tracking-[1.5px] uppercase text-muted-foreground">
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
                      "relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all duration-200",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted/30"
                    )}
                    style={isActive ? {
                      background: "hsl(var(--primary) / 0.10)",
                    } : undefined}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{ background: "hsl(var(--primary))" }}
                      />
                    )}
                    <item.icon
                      size={15}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={isActive ? "text-primary" : "text-muted-foreground"}
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
      <div className="px-3 py-3 border-t border-border space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
          <span className="text-[9.5px] font-semibold text-muted-foreground">Système opérationnel</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Shield size={10} className="text-muted-foreground shrink-0" />
            <span className="text-[9.5px] text-muted-foreground font-medium truncate">
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
            <LogOut size={11} />
          </Button>
        </div>
      </div>
    </aside>
  );
};

export { AppSidebar };
