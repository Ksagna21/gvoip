import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/noc/StatusBadge";
import {
  Network, Phone, PhoneCall, Activity, AlertTriangle,
  TrendingUp, Gauge, Wifi, ArrowUpRight,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { Link } from "react-router-dom";

/* ─────────────────────────────────────────────────────────────────
   NOTE : ajoute dans ton index.css (ou global CSS) :
   @import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800;900&display=swap');
   body { font-family: 'Raleway', sans-serif; }
───────────────────────────────────────────────────────────────── */

/* ── Recharts custom tooltip — s'adapte light/dark via Tailwind ── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1 font-semibold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name} : {p.value}
        </p>
      ))}
    </div>
  );
};

/* ── KPI Card ─────────────────────────────────────────────────── */
interface KpiProps {
  label: string;
  value: string | number;
  sub: string;
  accent?: boolean;
  trend?: "up" | "down" | "warn" | "none";
  to: string;
}

const KpiCard = ({ label, value, sub, accent = false, trend = "none", to }: KpiProps) => {
  const trendColor = trend === "up"   ? "text-emerald-500"
                   : trend === "down" ? "text-red-500"
                   : "text-amber-500";
  const trendBg   = trend === "up"   ? "bg-emerald-500/15"
                  : trend === "down" ? "bg-red-500/15"
                  : "bg-amber-500/15";
  const trendIcon = trend === "down" ? "↓" : trend === "warn" ? "!" : "↑";

  return (
    <Link to={to} className="block no-underline">
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.15 }}
        className={`
          relative rounded-2xl p-5 border transition-all duration-200 cursor-pointer
          ${accent
            ? "border-[#1A4D2E]"
            : "bg-card border-border hover:border-primary/30 dark:hover:border-primary/40"}
        `}
        style={accent ? {
          background: "linear-gradient(145deg, #1a3d28 0%, #1e5c35 40%, #2d7a4a 75%, #3a9460 100%)",
        } : undefined}
      >
        {/* Arrow top-right */}
        <div className={`
          absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center
          ${accent ? "bg-white/15" : "bg-muted"}
        `}>
          <ArrowUpRight
            size={13}
            className={accent ? "text-white/80" : "text-muted-foreground"}
          />
        </div>

        <p className={`text-[10px] font-bold tracking-widest uppercase mb-3
          ${accent ? "text-white/70" : "text-muted-foreground"}`}>
          {label}
        </p>

        <p className={`text-4xl font-black leading-none mb-3
          ${accent ? "text-white" : "text-foreground"}`}>
          {value}
        </p>

        <div className="flex items-center gap-2">
          {trend !== "none" && (
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${trendBg} ${trendColor}`}>
              {trendIcon}
            </span>
          )}
          <span className={`text-[11px] font-semibold
            ${accent ? "text-white/75" : "text-muted-foreground"}`}>
            {sub}
          </span>
        </div>
      </motion.div>
    </Link>
  );
};

/* ── Card wrapper ─────────────────────────────────────────────── */
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-card border border-border rounded-2xl p-5 ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ title, action }: { title: string; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-sm font-black text-foreground tracking-tight">{title}</h3>
    {action}
  </div>
);

/* ── SVG Donut ────────────────────────────────────────────────── */
const Donut = ({ pct, color = "#1A4D2E" }: { pct: number; color?: string }) => {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct / 100, 1);
  const id = `donut-grad-${Math.round(pct)}`;
  return (
    <svg width={130} height={130} viewBox="0 0 130 130">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#3a9460" />
          <stop offset="100%" stopColor="#1a3d28" />
        </linearGradient>
      </defs>
      <circle cx="65" cy="65" r={r} fill="none"
        stroke="currentColor" strokeWidth={13}
        className="text-muted-foreground/20" />
      <circle
        cx="65" cy="65" r={r}
        fill="none" stroke={`url(#${id})`} strokeWidth={13}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 65 65)"
        style={{ transition: "stroke-dasharray .8s ease" }}
      />
    </svg>
  );
};

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════ */
const Dashboard = () => {
  const [stats, setStats] = useState({
    trunks: 0, trunksUp: 0, trunksDown: 0,
    extensions: 0, extsOnline: 0,
    activeCalls: 0, alerts: 0, mos: 0,
  });
  const [trunks, setTrunks]             = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [qualityData, setQualityData]   = useState<any[]>([]);
  const [callVolume, setCallVolume]     = useState<any[]>([]);

  const { isAdmin, user }       = useAuth();
  const { applyFilter, ready }  = useAllowedIpbx();

  const fetchAll = async () => {
    try {
      const [trunkRes, extRes, callRes, alertRes, qualRes] = await Promise.all([
        applyFilter(supabase.from("sip_trunks").select("id, name, status, host")),
        applyFilter(supabase.from("extensions").select("id, status")),
        supabase.from("calls").select("id").eq("status", "active"),
        applyFilter(supabase.from("alerts")
          .select("id, type, title, message, created_at, acknowledged"))
          .eq("acknowledged", false)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase.from("quality_metrics")
          .select("mos, jitter, recorded_at")
          .gte("recorded_at", new Date(Date.now() - 3600000 * 24).toISOString())
          .order("recorded_at", { ascending: true }),
      ]);

      const t = trunkRes.data  || [];
      const e = extRes.data    || [];
      const c = callRes.data   || [];
      const a = alertRes.data  || [];

      setTrunks(t);
      setRecentAlerts(a);
      setStats({
        trunks:      t.length,
        trunksUp:    t.filter((x: any) => x.status === "up").length,
        trunksDown:  t.filter((x: any) => x.status === "down").length,
        extensions:  e.length,
        extsOnline:  e.filter((x: any) => x.status === "registered").length,
        activeCalls: c.length,
        alerts:      a.length,
        mos: qualRes.data?.length
          ? parseFloat((qualRes.data.reduce((s: number, m: any) => s + (m.mos || 0), 0) / qualRes.data.length).toFixed(2))
          : 0,
      });

      // Quality chart — grouper par heure
      if (qualRes.data && qualRes.data.length > 0) {
        const groups = new Map<string, number[]>();
        qualRes.data.forEach((m: any) => {
          const h = new Date(m.recorded_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          if (!groups.has(h)) groups.set(h, []);
          groups.get(h)!.push(m.mos || 0);
        });
        setQualityData(
          Array.from(groups.entries()).slice(-24).map(([time, vals]) => ({
            time,
            mos: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
          }))
        );
      }

      // Call volume
      const since24h = new Date(Date.now() - 3600000 * 24).toISOString();
      const cdrRes = await applyFilter(
        supabase.from("calls")
          .select("trunk_name, started_at, duration")
          .gte("started_at", since24h)
          .order("started_at", { ascending: true })
      );

      if (cdrRes.data && cdrRes.data.length > 0) {
        const groups = new Map<string, { entrants: number; sortants: number }>();
        cdrRes.data.forEach((call: any) => {
          if (!call.started_at) return;
          const d = new Date(call.started_at);
          const h = `${String(d.getHours()).padStart(2, "0")}:00`;
          if (!groups.has(h)) groups.set(h, { entrants: 0, sortants: 0 });
          groups.get(h)!.entrants += 1;
        });
        setCallVolume(Array.from(groups.entries()).map(([h, v]) => ({ h, ...v })));
      } else {
        setCallVolume([]);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setCallVolume([]);
    }
  };

  useEffect(() => { if (ready) fetchAll(); }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(fetchAll, 30000);
    return () => clearInterval(id);
  }, [ready]);

  /* Derived */
  const mosTarget   = stats.mos > 0 ? Math.round((stats.mos / 5) * 100) : 0;
  const extTarget   = stats.extensions > 0 ? Math.round((stats.extsOnline / stats.extensions) * 100) : 0;
  const trunkTarget = stats.trunks > 0 ? Math.round((stats.trunksUp / stats.trunks) * 100) : 0;
  const availPct    = stats.trunksDown === 0 ? 99 : Math.max(0, 100 - stats.trunksDown * 10);

  /* Recharts grid/axis — couleurs adaptées au thème via hsl(var(--...)) */
  const chartGrid = { strokeDasharray: "3 3", stroke: "hsl(var(--border))" };
  const chartTick = { fill: "hsl(var(--muted-foreground))", fontSize: 10 };

  /* Couleur accent MOS */
  const mosColor = stats.mos >= 4 ? "#1A4D2E" : stats.mos >= 3 ? "#F5A623" : "#E05C5C";

  /* Hauteurs fixes partagées pour aligner les rangées */
  const ROW2_H = 200; // px — Volume d'appels chart + Donut MOS
  const ROW3_H = 200; // px — Trunks list, MOS chart, Alertes

  return (
    <div className="space-y-4 pb-8" style={{ fontFamily: "'Raleway', sans-serif" }}>

      {/* ── En-tête ──────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-medium">
          Planifiez, priorisez et gérez votre infrastructure VoIP en temps réel.
        </p>
      </div>

      {/* ── RANGÉE 1 : 4 KPI cards — hauteur uniforme via items-stretch ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
        <KpiCard label="SIP Trunks" value={stats.trunks}
          sub={`${stats.trunksUp} UP · ${stats.trunksDown} DOWN`}
          accent trend={stats.trunksDown > 0 ? "down" : "up"} to="/sip-trunks" />
        <KpiCard label="Extensions" value={stats.extensions}
          sub={`${stats.extsOnline} en ligne`} trend="up" to="/extensions" />
        <KpiCard label="Appels actifs" value={stats.activeCalls}
          sub="En cours" trend="up" to="/calls" />
        <KpiCard label="Alertes" value={stats.alerts}
          sub="Non acquittées" trend={stats.alerts > 0 ? "down" : "none"} to="/alerts" />
      </div>

      {/* ── RANGÉE 2 : Volume d'appels (large) + Score MOS (fixe 260px) ── */}
      {/*   Les deux cards ont exactement la même hauteur totale           */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3">

        {/* Volume d'appels — hauteur fixe pour que le chart ne s'étire pas */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="bg-card border border-border rounded-2xl p-4" style={{ height: `${ROW2_H + 60}px` }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-foreground tracking-tight">Volume d'appels (24h)</h3>
            </div>
            {callVolume.length > 0 ? (
              <ResponsiveContainer width="100%" height={ROW2_H}>
                <BarChart data={callVolume} barCategoryGap="40%" margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#3a9460" />
                      <stop offset="100%" stopColor="#1a3d28" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="h" tick={chartTick} axisLine={false} tickLine={false} />
                  <YAxis tick={chartTick} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="entrants" name="Appels" fill="url(#barGradient)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height: ROW2_H }}>
                Aucun appel dans les 24 dernières heures
              </div>
            )}
          </div>
        </motion.div>

        {/* Score MOS — même hauteur totale que la card gauche */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div
            className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center justify-center gap-3"
            style={{ height: `${ROW2_H + 60}px` }}
          >
            <h3 className="text-sm font-black text-foreground tracking-tight self-start w-full">Score MOS</h3>
            <div className="relative">
              <Donut pct={mosTarget} color={mosColor} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-foreground">
                  {stats.mos > 0 ? stats.mos.toFixed(1) : "—"}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">/ 5.0</span>
              </div>
            </div>
            <div className="w-full">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
                <div className="h-full rounded-full bg-amber-400 transition-all duration-700"
                  style={{ width: `${trunkTarget}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground font-semibold">
                <span className="text-amber-500 font-black">{trunkTarget}%</span> trunks opérationnels
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── RANGÉE 3 : Trunks / MOS chart / Alertes — 3 cols égales, hauteur fixe ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Statut SIP Trunks */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="bg-card border border-border rounded-2xl p-4" style={{ height: `${ROW3_H + 60}px`, overflow: "hidden" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-foreground tracking-tight">Statut SIP Trunks</h3>
              <Link to="/sip-trunks">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline">Voir tout</span>
              </Link>
            </div>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: `${ROW3_H + 20}px` }}>
              {trunks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun trunk configuré</p>
              ) : trunks.map(trunk => (
                <div key={trunk.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 dark:bg-muted/20 hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{
                      background: trunk.status === "up" ? "#4CAF7D" : "#E05C5C",
                      boxShadow: `0 0 5px ${trunk.status === "up" ? "#4CAF7D88" : "#E05C5C88"}`,
                    }} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground font-mono truncate">{trunk.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{trunk.host || "—"}</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full shrink-0 ml-2" style={{
                    background: trunk.status === "up" ? "rgba(76,175,125,.15)" : "rgba(224,92,92,.15)",
                    color: trunk.status === "up" ? "#4CAF7D" : "#E05C5C",
                  }}>
                    {trunk.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* MOS Score Chart */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="bg-card border border-border rounded-2xl p-4" style={{ height: `${ROW3_H + 60}px` }}>
            <h3 className="text-sm font-black text-foreground tracking-tight mb-3">MOS Score (24h)</h3>
            {qualityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={ROW3_H}>
                <AreaChart data={qualityData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mosFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#3a9460" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1a3d28" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="time" tick={chartTick} axisLine={false} tickLine={false} />
                  <YAxis domain={[1, 5]} tick={chartTick} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="mos" name="MOS"
                    stroke="#2d7a4a" fill="url(#mosFill)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height: ROW3_H }}>
                Aucune donnée RTCP disponible
              </div>
            )}
          </div>
        </motion.div>

        {/* Alertes récentes */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="bg-card border border-border rounded-2xl p-4" style={{ height: `${ROW3_H + 60}px`, overflow: "hidden" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-foreground tracking-tight">Alertes récentes</h3>
              {stats.alerts > 0 && (
                <Link to="/alerts">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline">Voir tout</span>
                </Link>
              )}
            </div>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: `${ROW3_H + 20}px` }}>
              {recentAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucune alerte non acquittée</p>
              ) : recentAlerts.map(alert => (
                <div key={alert.id} className="flex gap-2 px-3 py-2 rounded-xl bg-muted/40 dark:bg-muted/20">
                  <span className="w-2 h-2 rounded-full mt-1 shrink-0"
                    style={{ background: alert.type === "critical" ? "#E05C5C" : "#F5A623" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{alert.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{alert.message}</p>
                    <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                      {new Date(alert.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── RANGÉE 4 : Objectifs — 4 cards égales ──────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-foreground tracking-tight">Objectifs</h3>
          <Link to="/quality">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
              Voir détails
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Score MOS",            pct: mosTarget,   color: "#E05C5C" },
            { label: "Extensions en ligne",  pct: extTarget,   color: "#4CAF7D" },
            { label: "Trunks opérationnels", pct: trunkTarget, color: "#F5A623" },
            { label: "Disponibilité",        pct: availPct,    color: "#4A90D9" },
          ].map(({ label, pct, color }) => (
            <div key={label} className="bg-card border border-border rounded-2xl px-4 py-4">
              <p className="text-xl font-black mb-2" style={{ color }}>{pct}%</p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: color }} />
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
