import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/noc/KPICard";
import { StatusBadge } from "@/components/noc/StatusBadge";
import {
  Network, Phone, PhoneCall, Gauge, Activity, AlertTriangle,
  ArrowLeft, Server, Wifi, Timer, Monitor, X, Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
];

type DetailView = "trunks" | "extensions" | "calls" | "alerts" | null;

const formatDuration = (seconds: number) => {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getFlagEmoji = (code: string) => {
  if (!code || code.length < 2) return "🌍";
  const chars = code.toUpperCase().slice(0, 2).split("");
  return chars.map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
};

const CountryDashboard = () => {
  const { id } = useParams<{ id: string }>();
  const [country, setCountry] = useState<any>(null);
  const [ipbxList, setIpbxList] = useState<any[]>([]);
  const [trunks, setTrunks] = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    const trunksUp = trunks.filter(t => t.status === "up").length;
    const trunksDown = trunks.filter(t => t.status === "down").length;
    const extOnline = extensions.filter(e => e.status === "registered").length;
    const activeCalls = calls.filter(c => c.status === "active" || c.status === "ringing").length;
    const avgMos = calls.length > 0
      ? calls.reduce((sum, c) => sum + (Number(c.mos) || 0), 0) / calls.length
      : 0;
    const avgLatency = trunks.length > 0
      ? Math.round(trunks.reduce((sum, t) => sum + (t.latency || 0), 0) / trunks.length)
      : 0;
    const unackAlerts = alerts.filter(a => !a.acknowledged).length;
    return { trunksUp, trunksDown, extOnline, activeCalls, avgMos, avgLatency, unackAlerts };
  }, [trunks, extensions, calls, alerts]);

  const trunkStatusData = useMemo(() => [
    { name: "UP", value: trunks.filter(t => t.status === "up").length },
    { name: "DOWN", value: trunks.filter(t => t.status === "down").length },
    { name: "Dégradé", value: trunks.filter(t => t.status === "degraded").length },
  ].filter(d => d.value > 0), [trunks]);

  const extStatusData = useMemo(() => [
    { name: "En ligne", value: extensions.filter(e => e.status === "registered").length },
    { name: "Hors ligne", value: extensions.filter(e => e.status === "unregistered").length },
    { name: "Occupé", value: extensions.filter(e => e.status === "busy").length },
  ].filter(d => d.value > 0), [extensions]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!country) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Pays introuvable</p>
        <Link to="/countries"><Button variant="ghost" className="mt-4"><ArrowLeft size={16} className="mr-2" /> Retour</Button></Link>
      </div>
    );
  }

  const activeCalls = calls.filter(c => c.status === "active" || c.status === "ringing");

  // filter lists when detail view is open
  const filteredDetailTrunks = trunks.filter((t) => {
    const q = detailSearch.toLowerCase();
    return (
      !q ||
      t.name.toLowerCase().includes(q) ||
      (t.provider || "").toLowerCase().includes(q) ||
      (t.ipbx?.name || "").toLowerCase().includes(q)
    );
  });
  const filteredDetailExtensions = extensions.filter((e) => {
    const q = detailSearch.toLowerCase();
    return (
      !q ||
      e.number.toLowerCase().includes(q) ||
      (e.name || "").toLowerCase().includes(q) ||
      (e.ipbx?.name || "").toLowerCase().includes(q)
    );
  });
  const filteredDetailCalls = activeCalls.filter((c) => {
    const q = detailSearch.toLowerCase();
    return (
      !q ||
      (c.caller_name || c.caller || "").toLowerCase().includes(q) ||
      (c.callee_name || c.callee || "").toLowerCase().includes(q)
    );
  });
  const filteredDetailAlerts = alerts.filter((a) => {
    const q = detailSearch.toLowerCase();
    return (
      !q ||
      a.title.toLowerCase().includes(q) ||
      a.message.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/countries">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft size={16} /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">{getFlagEmoji(country.code)}</span>
            Dashboard — {country.name}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{country.code} · {country.timezone} · {ipbxList.length} IPBX</p>
        </div>
      </div>

      {/* Clickable KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="cursor-pointer" onClick={() => setActiveDetail(activeDetail === "trunks" ? null : "trunks")}>
          <KPICard title="SIP Trunks" value={trunks.length} subtitle={`${kpis.trunksUp} UP · ${kpis.trunksDown} DOWN`} icon={Network} variant={kpis.trunksDown > 0 ? "destructive" : "success"} className={activeDetail === "trunks" ? "ring-2 ring-primary" : ""} />
        </div>
        <div className="cursor-pointer" onClick={() => setActiveDetail(activeDetail === "extensions" ? null : "extensions")}>
          <KPICard title="Extensions" value={extensions.length} subtitle={`${kpis.extOnline} en ligne`} icon={Phone} variant="primary" className={activeDetail === "extensions" ? "ring-2 ring-primary" : ""} />
        </div>
        <div className="cursor-pointer" onClick={() => setActiveDetail(activeDetail === "calls" ? null : "calls")}>
          <KPICard title="Appels actifs" value={kpis.activeCalls} subtitle="En cours" icon={PhoneCall} variant="success" className={activeDetail === "calls" ? "ring-2 ring-primary" : ""} />
        </div>
        <KPICard title="MOS moyen" value={kpis.avgMos > 0 ? kpis.avgMos.toFixed(1) : "—"} subtitle={kpis.avgMos >= 4 ? "Qualité bonne" : kpis.avgMos > 0 ? "Qualité dégradée" : "Pas de données"} icon={Gauge} variant={kpis.avgMos >= 4 ? "success" : kpis.avgMos > 0 ? "warning" : "default"} />
        <KPICard title="Latence moy." value={kpis.avgLatency > 0 ? `${kpis.avgLatency}ms` : "—"} subtitle="SIP Trunks" icon={Activity} variant="primary" />
        <div className="cursor-pointer" onClick={() => setActiveDetail(activeDetail === "alerts" ? null : "alerts")}>
          <KPICard title="Alertes" value={kpis.unackAlerts} subtitle="Non acquittées" icon={AlertTriangle} variant={kpis.unackAlerts > 0 ? "destructive" : "default"} className={activeDetail === "alerts" ? "ring-2 ring-primary" : ""} />
        </div>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {activeDetail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="noc-card border border-border overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  {activeDetail === "trunks" && `SIP Trunks — ${country.name}`}
                  {activeDetail === "extensions" && `Extensions — ${country.name}`}
                  {activeDetail === "calls" && `Appels actifs — ${country.name}`}
                  {activeDetail === "alerts" && `Alertes — ${country.name}`}
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActiveDetail(null)}>
                  <X size={14} />
                </Button>
              </div>

              {/* detail search */}
              <div className="relative max-w-sm mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="pl-9 h-9"
                />
              </div>

              {/* Trunks Detail */}
              {activeDetail === "trunks" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Nom</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Statut</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">IP Locale</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">IP Distante</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">IPBX</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase">Latence</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase">Canaux</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase">Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trunks.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucun trunk</td></tr>
                      ) : filteredDetailTrunks.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucun résultat</td></tr>
                      ) : filteredDetailTrunks.map((t, i) => (
                        <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-2 font-mono font-bold text-foreground">{t.name}</td>
                          <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{t.local_ip || t.ipbx?.ip_address || "—"}</td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{t.remote_ip || "—"}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{t.ipbx?.name || "—"}</td>
                          <td className="px-4 py-2 text-center font-mono">{t.latency ? `${t.latency}ms` : "—"}</td>
                          <td className="px-4 py-2 text-center font-mono">{t.channels ?? 0}</td>
                          <td className="px-4 py-2 text-center font-mono">{t.status === "up" ? <span className="text-success">UP</span> : <span className="text-destructive">DOWN</span>}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Extensions Detail */}
              {activeDetail === "extensions" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Numéro</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Nom</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Statut</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">IPBX</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">IP</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Appels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extensions.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aucune extension</td></tr>
                      ) : filteredDetailExtensions.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aucun résultat</td></tr>
                      ) : filteredDetailExtensions.map((ext, i) => (
                        <motion.tr key={ext.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-2 font-mono font-bold text-foreground flex items-center gap-2">
                            <Phone size={14} className="text-primary" /> {ext.number}
                          </td>
                          <td className="px-4 py-2 text-foreground">{ext.name}</td>
                          <td className="px-4 py-2"><StatusBadge status={ext.status} /></td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{ext.ipbx?.name || "—"}</td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{ext.ip_address || "—"}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-foreground">{ext.calls_today ?? 0}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Calls Detail */}
              {activeDetail === "calls" && (
                <div className="space-y-2">
                  {activeCalls.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-6">Aucun appel actif</p>
                  ) : filteredDetailCalls.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-6">Aucun résultat</p>
                  ) : filteredDetailCalls.map((call, i) => (
                    <motion.div key={call.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <StatusBadge status={call.status} />
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">{call.caller_name || call.caller}</p>
                            <p className="text-xs font-mono text-muted-foreground">{call.caller}</p>
                          </div>
                          <span className="text-primary font-mono">→</span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{call.callee_name || call.callee}</p>
                            <p className="text-xs font-mono text-muted-foreground">{call.callee}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-5 text-xs">
                        <div className="text-center">
                          <p className="text-muted-foreground uppercase">Durée</p>
                          <p className="font-mono font-bold text-foreground flex items-center gap-1"><Timer size={12} />{formatDuration(call.duration)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground uppercase">Codec</p>
                          <p className="font-mono font-bold text-foreground">{call.codec || "—"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground uppercase">MOS</p>
                          <p className={`font-mono font-bold ${Number(call.mos) >= 4 ? "text-success" : Number(call.mos) >= 3.5 ? "text-warning" : "text-destructive"}`}>{Number(call.mos) > 0 ? Number(call.mos).toFixed(1) : "—"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground uppercase">IPBX</p>
                          <p className="font-mono text-xs text-muted-foreground">{call.ipbx?.name || "—"}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Alerts Detail */}
              {activeDetail === "alerts" && (
                <div className="space-y-2">
                  {alerts.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-6">Aucune alerte</p>
                  ) : filteredDetailAlerts.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-6">Aucun résultat</p>
                  ) : filteredDetailAlerts.map((alert, i) => (
                    <motion.div key={alert.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className={`flex items-start gap-3 p-3 rounded-md transition-colors ${alert.acknowledged ? "bg-muted/20" : "bg-muted/40"}`}>
                      <StatusBadge status={alert.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{alert.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-1">{new Date(alert.created_at).toLocaleString("fr-FR")}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Charts + IPBX list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="noc-card p-4 border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Network size={16} className="text-primary" /> Statut Trunks
          </h3>
          {trunkStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={trunkStatusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {trunkStatusData.map((entry, i) => <Cell key={i} fill={entry.name === "UP" ? "hsl(142, 70%, 45%)" : "hsl(0, 70%, 50%)"} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: 8, fontSize: 12, color: "hsl(210, 20%, 92%)" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">Aucun trunk</div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="noc-card p-4 border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Phone size={16} className="text-success" /> Statut Extensions
          </h3>
          {extStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={extStatusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {extStatusData.map((entry, i) => <Cell key={i} fill={entry.name === "En ligne" ? "hsl(142, 70%, 45%)" : entry.name === "Hors ligne" ? "hsl(0, 70%, 50%)" : "hsl(45, 70%, 50%)"} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: 8, fontSize: 12, color: "hsl(210, 20%, 92%)" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">Aucune extension</div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="noc-card p-4 border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Server size={16} className="text-primary" /> IPBX ({ipbxList.length})
          </h3>
          <div className="space-y-2">
            {ipbxList.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">Aucun IPBX</p>
            ) : ipbxList.map(ipbx => (
              <div key={ipbx.id} className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <StatusBadge status={ipbx.status === "online" ? "up" : "down"} />
                  <div>
                    <p className="text-sm font-mono font-medium text-foreground">{ipbx.name}</p>
                    <p className="text-xs text-muted-foreground">{ipbx.type} · {ipbx.ip_address}</p>
                  </div>
                </div>
                {ipbx.ping_latency > 0 && (
                  <span className="text-xs font-mono text-muted-foreground">{ipbx.ping_latency}ms</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default CountryDashboard;
