import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  Globe,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Moon,
  Network,
  Phone,
  PhoneCall,
  Server,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

/* ── Dark mode avec persistance ───────────────────────────── */
const useDarkMode = () => {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark);
    return prefersDark;
  });

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return { dark, toggle };
};

/* ── Horloge en temps réel ─────────────────────────────────── */
const useClock = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return now;
};

/* ═══════════════════════════════════════════════════════════
   TOPBAR — Design moderne & élégant
═══════════════════════════════════════════════════════════ */
export const AppTopbar = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const { dark, toggle } = useDarkMode();
  const now = useClock();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const dateStr = now.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="h-14 flex items-center justify-between px-4 bg-transparent dark:bg-transparent z-50">
      {/* Menu burger mobile */}
      {isMobile && (
        <button
          onClick={onMenuClick}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-card hover:bg-accent border border-border/70 active:scale-95 transition-all"
        >
          <Menu size={20} className="text-foreground" />
        </button>
      )}

      <div className="flex-1 flex items-center justify-end gap-3">
        {/* Date & Heure */}
        <div className="hidden sm:flex items-center gap-3 px-4 py-1.5 bg-transparent dark:bg-transparent">
          <div className="flex items-center gap-2 text-muted-foreground">
            {/* <div className="w-4 h-4 rounded-md border border-current flex items-center justify-center">
              <span className="text-[10px]">📅</span>
            </div> */}
            <span className="text-xs font-mono font-semibold tracking-widest">{dateStr}</span>
          </div>

          {/* <div className="w-px h-4 bg-border" /> */}

          <div className="flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
            {timeStr}
          </div>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className={cn(
            "w-9 h-9 flex items-center justify-center",
            "active:scale-95 transition-all duration-200"
          )}
          title={dark ? "Passer en mode clair" : "Passer en mode sombre"}
        >
          {dark ? (
            <Sun size={18} className="text-cyan-400" />
          ) : (
            <Moon size={18} className="text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   SIDEBAR CONTENT
═══════════════════════════════════════════════════════════ */
const SidebarContent = ({ isCollapsed, onCollapse }: { isCollapsed: boolean; onCollapse: () => void }) => {
  const location = useLocation();
  const { isAdmin, user, signOut, canView } = useAuth();

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Tableau de bord", show: isAdmin || canView("dashboard"), section: "menu" },
    { to: "/network-map", icon: Map, label: "Carte réseau", show: isAdmin || canView("network_map"), section: "menu" },
    { to: "/countries", icon: Globe, label: "Pays", show: canView("dashboard_country"), section: "menu" },
    { to: "/ipbx", icon: Server, label: "IPBX", show: canView("settings"), section: "menu" },
    { to: "/sip-trunks", icon: Network, label: "SIP Trunks", show: canView("sip_trunks"), section: "menu" },
    { to: "/extensions", icon: Phone, label: "Extensions", show: canView("extensions"), section: "menu" },
    { to: "/calls", icon: PhoneCall, label: "Appels", show: canView("cdr"), section: "menu" },
    { to: "/quality", icon: Activity, label: "Qualité VoIP", show: canView("quality"), section: "general" },
    { to: "/alerts", icon: Bell, label: "Alertes", show: canView("alerts"), section: "general" },
    { to: "/users", icon: Users, label: "Utilisateurs", show: isAdmin, section: "general" },
  ];

  const menuItems = navItems.filter((i) => i.show && i.section === "menu");
  const generalItems = navItems.filter((i) => i.show && i.section === "general");

  return (
    <>
      {/* Header */}
      <div className="px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/GVOIP.png" alt="GVoIP" className={`w-9 h-9 ` + (isCollapsed ? 'object-contain' : '')} />
          {!isCollapsed && (
            <h1 className="text-2xl font-black tracking-tighter">
              G<span className="text-primary">VoIP</span>
            </h1>
          )}
        </div>

        <button
          onClick={onCollapse}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-accent transition-colors"
          title={isCollapsed ? "Déplier" : "Replier"}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-8 scrollbar-thin">
        {/* MENU PRINCIPAL */}
        {menuItems.length > 0 && (
          <div>
            {!isCollapsed && (
              <p className="px-3 mb-3 text-[10px] dark:text-white text-muted-foreground/50">MENU</p>
            )}
            <div className="space-y-1">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
                      isActive
                        ? "text-primary bg-primary/10 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
                    )}

                    <item.icon
                      size={20}
                      strokeWidth={isActive ? 2.5 : 1.8}
                      className={isActive ? "text-primary" : "group-hover:text-foreground transition-colors"}
                    />

                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION GÉNÉRAL */}
        {generalItems.length > 0 && (
          <div>
            {!isCollapsed && (
              <p className="px-3 mb-3 text-[10px] dark:text-white text-muted-foreground/50">GÉNÉRAL</p>
            )}
            <div className="space-y-1">
              {generalItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
                      isActive
                        ? "text-primary bg-primary/10 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
                    )}

                    <item.icon
                      size={20}
                      strokeWidth={isActive ? 2.5 : 1.8}
                      className={isActive ? "text-primary" : "group-hover:text-foreground transition-colors"}
                    />

                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Footer Profil */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {!isCollapsed && <span className="text-xs font-medium text-muted-foreground">Système opérationnel</span>}
        </div>

        {!isCollapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="font-bold text-primary text-lg">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user?.email?.split("@")[0] || "Utilisateur"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="h-9 w-9 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl"
            >
              <LogOut size={18} />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="mx-auto h-10 w-10 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl"
          >
            <LogOut size={18} />
          </Button>
        )}
      </div>
    </>
  );
};

/* ═══════════════════════════════════════════════════════════
   SIDEBAR DESKTOP (collapsible)
═══════════════════════════════════════════════════════════ */
const DesktopSidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className="hidden md:flex z-40 flex-col bg-card shadow-xl overflow-y-scroll [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] transition-all duration-300 max-h-screen"
      style={{ width: isCollapsed ? "78px" : "248px" }}
    >
      <SidebarContent isCollapsed={isCollapsed} onCollapse={() => setIsCollapsed(!isCollapsed)} />
    </aside>
  );
};

/* ═══════════════════════════════════════════════════════════
   SIDEBAR MOBILE (Drawer)
═══════════════════════════════════════════════════════════ */
const MobileSidebar = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 w-72 bg-card border-r border-border flex flex-col shadow-2xl transition-transform duration-300 md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-accent"
          >
            <X size={22} />
          </button>
        </div>

        <SidebarContent isCollapsed={false} onCollapse={() => {}} />
      </div>
    </>
  );
};

/* ═══════════════════════════════════════════════════════════
   EXPORT FINAL
═══════════════════════════════════════════════════════════ */
export const AppSidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <DesktopSidebar />
      <MobileSidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Topbar mobile uniquement */}
      <div className="fixed top-0 left-0 right-0 z-50 md:hidden backdrop-blur-lg">
        <AppTopbar onMenuClick={() => setMobileOpen((prev) => !prev)} />
      </div>
    </>
  );
};