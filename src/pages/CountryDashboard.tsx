import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/noc/StatusBadge";
import {
  Network, Phone, PhoneCall, Gauge, Activity, AlertTriangle,
  ArrowLeft, Server, Timer, X, Search, ArrowUpRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Helpers ──────────────────────────────────────────────── */
const formatDuration = (seconds: number) => {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getFlagEmoji = (code: string) => {
  if (!code || code.length < 2) return "🌍";
  return code.toUpperCase().slice(0, 2).split("")
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
};

/* ── Shared card components ───────────────────────────────── */
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

/* ── KPI Card — même style que Dashboard global ───────────── */
interface KpiProps {
  label: string;
  value: string | number;
  sub: string;
  accent?: boolean;
  trend?: "up" | "down" | "warn" | "none";
  onClick?: () => void;
  active?: boolean;
  icon?: React.ReactNode;
  iconColor?: string;
}

const KpiCard = ({ label, value, sub, accent = false, trend = "none", onClick, active, icon, iconColor }: KpiProps) => {
  const trendIcon = trend === "down" ? "↓" : trend === "warn" ? "!" : "↑";
  const trendColor = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-warning";
  const trendBg   = trend === "up" ? "bg-success/15" : trend === "down" ? "bg-destructive/15" : "bg-warning/15";

  const isHighlighted = accent || active;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={`
        relative rounded-2xl p-5 border transition-all duration-300
        ${onClick ? "cursor-pointer" : ""}
        ${isHighlighted ? "border-primary/60" : "bg-card border-border hover:border-primary/30"}
      `}
      style={isHighlighted ? {
        background: "linear-gradient(145deg, #0277a8 0%, #0295cc 40%, #04AAEE 75%, #5ed0ff 100%)",
      } : undefined}
    >
      <div
        className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
        style={icon && iconColor
          ? { background: isHighlighted ? "rgba(255,255,255,0.15)" : `${iconColor}22` }
          : { background: isHighlighted ? "rgba(255,255,255,0.15)" : "hsl(var(--muted))" }
        }
      >
        {icon
          ? <span style={{ color: isHighlighted ? "rgba(255,255,255,0.85)" : iconColor }}>{icon}</span>
          : <ArrowUpRight size={13} className={isHighlighted ? "text-white/80" : "text-muted-foreground"} />
        }
      </div>
      <p className={`text-[10px] font-bold tracking-widest uppercase mb-3 ${isHighlighted ? "text-white/70" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p className={`text-4xl font-black leading-none mb-3 ${isHighlighted ? "text-white" : "text-foreground"}`}>
        {value}
      </p>
      <div className="flex items-center gap-2">
        {trend !== "none" && (
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black
            ${isHighlighted ? "bg-white/20 text-white" : `${trendBg} ${trendColor}`}`}>
            {trendIcon}
          </span>
        )}
        <span className={`text-[11px] font-semibold ${isHighlighted ? "text-white/75" : "text-muted-foreground"}`}>
          {sub}
        </span>
      </div>
    </motion.div>
  );
};

/* ── Recharts tooltip ─────────────────────────────────────── */
const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.payload.color }} className="font-bold">
          {p.name} : {p.value}
        </p>
      ))}
    </div>
  );
};

type DetailView = "trunks" | "extensions" | "calls" | "alerts" | null;

/* ═══════════════════════════════════════════════════════════
   COUNTRY DASHBOARD
═══════════════════════════════════════════════════════════ */
const CountryDashboard = () => {
  const { id } = useParams<{ id: string }>();
  const [country, setCountry]     = useState<any>(null);
  const [ipbxList, setIpbxList]   = useState<any[]>([]);
  const [trunks, setTrunks]       = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [calls, setCalls]         = useState<any[]>([]);
  const [alerts, setAlerts]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeDetail, setActiveDetail] = useState<DetailView>(null);
  const [detailSearch, setDetailSearch] = useState("");

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const [countryRes, ipbxRes] = await Promise.all([
        supabase.from("countries").select("*").eq("id", id).single(),
        supabase.from("ipbx").select("*").eq("country_id", id),
      ]);
      setCountry(countryRes.data);
      const ipbxs = ipbxRes.data || [];
      setIpbxList(ipbxs);
      if (ipbxs.length > 0) {
        const ipbxIds = ipbxs.map((i: any) => i.id);
        const [trunkRes, extRes, callRes, alertRes] = await Promise.all([
          supabase.from("sip_trunks").select("*, ipbx:ipbx!sip_trunks_ipbx_id_fkey(name, ip_address)").in("ipbx_id", ipbxIds),
          supabase.from("extensions").select("*, ipbx:ipbx_id(name)").in("ipbx_id", ipbxIds),
          supabase.from("calls").select("*, ipbx:ipbx_id(name)").in("ipbx_id", ipbxIds).order("started_at", { ascending: false }).limit(100),
          supabase.from("alerts").select("*").eq("country_id", id).order("created_at", { ascending: false }).limit(20),
        ]);
        setTrunks(trunkRes.data || []);
        setExtensions(extRes.data || []);
        setCalls(callRes.data || []);
        setAlerts(alertRes.data || []);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const kpis = useMemo(() => {
    const trunksUp    = trunks.filter(t => t.status === "up").length;
    const trunksDown  = trunks.filter(t => t.status === "down").length;
    const extOnline   = extensions.filter(e => e.status === "registered").length;
    const activeCalls = calls.filter(c => c.status === "active" || c.status === "ringing").length;
    const avgMos      = calls.length > 0 ? calls.reduce((s, c) => s + (Number(c.mos) || 0), 0) / calls.length : 0;
    const avgLatency  = trunks.length > 0 ? Math.round(trunks.reduce((s, t) => s + (t.latency || 0), 0) / trunks.length) : 0;
    const unackAlerts = alerts.filter(a => !a.acknowledged).length;
    return { trunksUp, trunksDown, extOnline, activeCalls, avgMos, avgLatency, unackAlerts };
  }, [trunks, extensions, calls, alerts]);

  const trunkStatusData = useMemo(() => [
    { name: "UP",      value: trunks.filter(t => t.status === "up").length,       color: "hsl(var(--success))" },
    { name: "DOWN",    value: trunks.filter(t => t.status === "down").length,      color: "hsl(var(--destructive))" },
    { name: "Dégradé", value: trunks.filter(t => t.status === "degraded").length,  color: "hsl(var(--warning))" },
  ].filter(d => d.value > 0), [trunks]);

  const extStatusData = useMemo(() => [
    { name: "En ligne",  value: extensions.filter(e => e.status === "registered").length,   color: "hsl(var(--success))" },
    { name: "Hors ligne",value: extensions.filter(e => e.status === "unregistered").length,  color: "hsl(var(--destructive))" },
    { name: "Occupé",   value: extensions.filter(e => e.status === "busy").length,           color: "hsl(var(--warning))" },
  ].filter(d => d.value > 0), [extensions]);

  const activeCalls = calls.filter(c => c.status === "active" || c.status === "ringing");

  const filteredDetailTrunks = trunks.filter(t => {
    const q = detailSearch.toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || (t.provider || "").toLowerCase().includes(q) || (t.ipbx?.name || "").toLowerCase().includes(q);
  });
  const filteredDetailExtensions = extensions.filter(e => {
    const q = detailSearch.toLowerCase();
    return !q || e.number.toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q) || (e.ipbx?.name || "").toLowerCase().includes(q);
  });
  const filteredDetailCalls = activeCalls.filter(c => {
    const q = detailSearch.toLowerCase();
    return !q || (c.caller_name || c.caller || "").toLowerCase().includes(q) || (c.callee_name || c.callee || "").toLowerCase().includes(q);
  });
  const filteredDetailAlerts = alerts.filter(a => {
    const q = detailSearch.toLowerCase();
    return !q || a.title.toLowerCase().includes(q) || a.message.toLowerCase().includes(q) || (a.source || "").toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="space-y-4" style={{ fontFamily: "'Raleway', sans-serif" }}>
      <Skeleton className="h-8 w-64 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    </div>
  );

  if (!country) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Pays introuvable</p>
      <Link to="/countries"><Button variant="ghost" className="mt-4"><ArrowLeft size={16} className="mr-2" />Retour</Button></Link>
    </div>
  );

  return (
    <div className="space-y-4 pb-8" style={{ fontFamily: "'Raleway', sans-serif" }}>

      {/* ── En-tête ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link to="/countries">
          <button className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft size={15} className="text-muted-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span>{getFlagEmoji(country.code)}</span>
            Dashboard — {country.name}
          </h1>
          <p className="text-sm text-muted-foreground font-medium mt-0.5">
            {country.code} · {country.timezone} · {ipbxList.length} IPBX
          </p>
        </div>
      </div>

      {/* ── RANGÉE 1 : KPI Cards ────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="SIP Trunks" value={trunks.length}
          sub={`${kpis.trunksUp} UP · ${kpis.trunksDown} DOWN`}
          trend={kpis.trunksDown > 0 ? "down" : "up"}
          onClick={() => setActiveDetail(activeDetail === "trunks" ? null : "trunks")}
          active={activeDetail === "trunks"}
          icon={<Network size={15} />} iconColor="#E05C5C" />
        <KpiCard label="Extensions" value={extensions.length}
          sub={`${kpis.extOnline} en ligne`} trend="up"
          onClick={() => setActiveDetail(activeDetail === "extensions" ? null : "extensions")}
          active={activeDetail === "extensions"}
          icon={<Phone size={15} />} iconColor="hsl(186 97% 42%)" />
        <KpiCard label="Appels actifs" value={kpis.activeCalls}
          sub="En cours" trend="up"
          onClick={() => setActiveDetail(activeDetail === "calls" ? null : "calls")}
          active={activeDetail === "calls"}
          icon={<PhoneCall size={15} />} iconColor="hsl(var(--success))" />
        <KpiCard label="MOS moyen"
          value={kpis.avgMos > 0 ? kpis.avgMos.toFixed(1) : "—"}
          sub={kpis.avgMos >= 4 ? "Qualité bonne" : kpis.avgMos > 0 ? "Dégradée" : "Pas de données"}
          trend={kpis.avgMos >= 4 ? "up" : kpis.avgMos > 0 ? "warn" : "none"}
          icon={<Gauge size={15} />} iconColor="hsl(var(--success))" />
        <KpiCard label="Latence moy."
          value={kpis.avgLatency > 0 ? `${kpis.avgLatency}ms` : "—"}
          sub="SIP Trunks" trend="none"
          icon={<Activity size={15} />} iconColor="hsl(199 97% 48%)" />
        <KpiCard label="Alertes" value={kpis.unackAlerts}
          sub="Non acquittées" trend={kpis.unackAlerts > 0 ? "down" : "none"}
          onClick={() => setActiveDetail(activeDetail === "alerts" ? null : "alerts")}
          active={activeDetail === "alerts"}
          icon={<AlertTriangle size={15} />} iconColor="#F5A623" />
      </div>

      {/* ── Detail Panel ────────────────────────────────────── */}
      <AnimatePresence>
        {activeDetail && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-foreground tracking-tight">
                  {activeDetail === "trunks"     && `SIP Trunks — ${country.name}`}
                  {activeDetail === "extensions" && `Extensions — ${country.name}`}
                  {activeDetail === "calls"      && `Appels actifs — ${country.name}`}
                  {activeDetail === "alerts"     && `Alertes — ${country.name}`}
                </h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={detailSearch} onChange={e => setDetailSearch(e.target.value)}
                      placeholder="Rechercher…" className="pl-8 h-8 text-xs w-48 rounded-xl" />
                  </div>
                  <button onClick={() => { setActiveDetail(null); setDetailSearch(""); }}
                    className="w-7 h-7 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                    <X size={13} className="text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Trunks */}
              {activeDetail === "trunks" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border">
                      {["Nom","Statut","IP Locale","IP Distante","IPBX","Latence","Canaux"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-black text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filteredDetailTrunks.length === 0
                        ? <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Aucun résultat</td></tr>
                        : filteredDetailTrunks.map((t, i) => (
                          <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                            className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 font-mono font-bold text-foreground">{t.name}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full"
                                style={{ background: t.status === "up" ? "rgba(76,175,125,.15)" : "rgba(224,92,92,.15)", color: t.status === "up" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                                {t.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{t.local_ip || t.ipbx?.ip_address || "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{t.remote_ip || "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{t.ipbx?.name || "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-center">{t.latency ? `${t.latency}ms` : "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-center">{t.channels ?? 0}</td>
                          </motion.tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              )}

              {/* Extensions */}
              {activeDetail === "extensions" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border">
                      {["Numéro","Nom","Statut","IPBX","IP","Appels"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-black text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filteredDetailExtensions.length === 0
                        ? <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Aucun résultat</td></tr>
                        : filteredDetailExtensions.map((ext, i) => (
                          <motion.tr key={ext.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                            className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 font-mono font-bold text-foreground">{ext.number}</td>
                            <td className="px-3 py-2.5 text-foreground">{ext.name}</td>
                            <td className="px-3 py-2.5"><StatusBadge status={ext.status} /></td>
                            <td className="px-3 py-2.5 text-muted-foreground">{ext.ipbx?.name || "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{ext.ip_address || "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-right font-bold text-foreground">{ext.calls_today ?? 0}</td>
                          </motion.tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              )}

              {/* Calls */}
              {activeDetail === "calls" && (
                <div className="space-y-2">
                  {filteredDetailCalls.length === 0
                    ? <p className="text-center text-muted-foreground text-sm py-6">Aucun appel actif</p>
                    : filteredDetailCalls.map((call, i) => (
                      <motion.div key={call.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-muted/40 dark:bg-muted/20">
                        <div className="flex items-center gap-4">
                          <StatusBadge status={call.status} />
                          <div className="flex items-center gap-2 text-xs">
                            <div className="text-right">
                              <p className="font-bold text-foreground">{call.caller_name || call.caller}</p>
                              <p className="font-mono text-muted-foreground">{call.caller}</p>
                            </div>
                            <span className="text-primary font-mono font-black">→</span>
                            <div>
                              <p className="font-bold text-foreground">{call.callee_name || call.callee}</p>
                              <p className="font-mono text-muted-foreground">{call.callee}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[10px]">
                          <div className="text-center">
                            <p className="text-muted-foreground uppercase font-bold">Durée</p>
                            <p className="font-mono font-black text-foreground flex items-center gap-1"><Timer size={10} />{formatDuration(call.duration)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground uppercase font-bold">MOS</p>
                            <p className={`font-mono font-black ${Number(call.mos) >= 4 ? "text-success" : Number(call.mos) >= 3.5 ? "text-warning" : "text-destructive"}`}>
                              {Number(call.mos) > 0 ? Number(call.mos).toFixed(1) : "—"}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground uppercase font-bold">IPBX</p>
                            <p className="font-mono text-muted-foreground">{call.ipbx?.name || "—"}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  }
                </div>
              )}

              {/* Alerts */}
              {activeDetail === "alerts" && (
                <div className="space-y-2">
                  {filteredDetailAlerts.length === 0
                    ? <p className="text-center text-muted-foreground text-sm py-6">Aucune alerte</p>
                    : filteredDetailAlerts.map((alert, i) => (
                      <motion.div key={alert.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                        className="flex gap-2.5 px-3 py-2.5 rounded-xl bg-muted/40 dark:bg-muted/20">
                        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                          style={{ background: alert.type === "critical" ? "hsl(var(--destructive))" : "hsl(var(--warning))" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{alert.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{alert.message}</p>
                          <p className="text-[9px] text-muted-foreground font-mono mt-0.5">{new Date(alert.created_at).toLocaleString("fr-FR")}</p>
                        </div>
                      </motion.div>
                    ))
                  }
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RANGÉE 2 : Charts + IPBX ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Statut Trunks */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader title="Statut Trunks" />
            {trunkStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={trunkStatusData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                    paddingAngle={4} dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {trunkStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">Aucun trunk</div>
            )}
          </Card>
        </motion.div>

        {/* Statut Extensions */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader title="Statut Extensions" />
            {extStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={extStatusData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                    paddingAngle={4} dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {extStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">Aucune extension</div>
            )}
          </Card>
        </motion.div>

        {/* IPBX */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader title={`IPBX (${ipbxList.length})`} />
            <div className="space-y-2 min-h-[180px]">
              {ipbxList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun IPBX</p>
              ) : ipbxList.map(ipbx => (
                <div key={ipbx.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 dark:bg-muted/20 hover:bg-muted/60 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{
                      background: ipbx.status === "online" ? "hsl(var(--success))" : "hsl(var(--destructive))",
                      boxShadow: `0 0 5px ${ipbx.status === "online" ? "hsl(var(--success) / 0.5)" : "hsl(var(--destructive) / 0.5)"}`,
                    }} />
                    <div>
                      <p className="text-xs font-bold text-foreground font-mono">{ipbx.name}</p>
                      <p className="text-[10px] text-muted-foreground">{ipbx.type} · {ipbx.ip_address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ipbx.ping_latency > 0 && (
                      <span className="text-[9px] font-mono text-muted-foreground">{ipbx.ping_latency}ms</span>
                    )}
                    <span className="text-[9px] font-black uppercase px-2 py-1 rounded-full"
                      style={{
                        background: ipbx.status === "online" ? "rgba(76,175,125,.15)" : "rgba(224,92,92,.15)",
                        color: ipbx.status === "online" ? "hsl(var(--success))" : "hsl(var(--destructive))",
                      }}>
                      {ipbx.status === "online" ? "UP" : "DOWN"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default CountryDashboard;
