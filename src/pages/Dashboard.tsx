import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/noc/KPICard";
import { StatusBadge } from "@/components/noc/StatusBadge";
import {
  Network, Phone, PhoneCall, Activity, AlertTriangle, TrendingUp, Gauge, Wifi
} from "lucide-react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";
import { Link } from "react-router-dom";

const tooltipStyle = { background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: 8, fontSize: 12 };
const gridStyle = { strokeDasharray: "3 3", stroke: "hsl(220, 14%, 18%)" };
const axisStyle = { stroke: "hsl(215, 15%, 55%)", fontSize: 10 };

const Dashboard = () => {
  const [stats, setStats] = useState({ trunks: 0, trunksUp: 0, trunksDown: 0, extensions: 0, extsOnline: 0, activeCalls: 0, alerts: 0, mos: 0 });
  const [trunks, setTrunks] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [qualityData, setQualityData] = useState<any[]>([]);
  const [callVolume, setCallVolume] = useState<any[]>([]);
  const { isAdmin, user } = useAuth();
  const { applyFilter, allowedIpbxIds, ready } = useAllowedIpbx();

  const fetchAll = async () => {
    try {
      const [trunkRes, extRes, callRes, alertRes, qualRes] = await Promise.all([
        applyFilter(supabase.from("sip_trunks").select("id, name, status, host")),
        applyFilter(supabase.from("extensions").select("id, status")),
        supabase.from("calls").select("id").eq("status", "active"),
        applyFilter(supabase.from("alerts").select("id, type, title, message, created_at, acknowledged")).eq("acknowledged", false).order("created_at", { ascending: false }).limit(5),
        supabase.from("quality_metrics").select("mos, jitter, recorded_at").gte("recorded_at", new Date(Date.now() - 3600000 * 24).toISOString()).order("recorded_at", { ascending: true }),
      ]);

    const t = trunkRes.data || [];
    const e = extRes.data || [];
    const c = callRes.data || [];
    const a = alertRes.data || [];

    setTrunks(t);
    setRecentAlerts(a);
    setStats({
      trunks: t.length,
      trunksUp: t.filter(x => x.status === "up").length,
      trunksDown: t.filter(x => x.status === "down").length,
      extensions: e.length,
      extsOnline: e.filter(x => x.status === "registered").length,
      activeCalls: c.length,
      alerts: a.length,
      mos: qualRes.data?.length ? parseFloat((qualRes.data.reduce((s: number, m: any) => s + (m.mos || 0), 0) / qualRes.data.length).toFixed(2)) : 0,
    });

    // Quality chart - grouper par heure
    if (qualRes.data && qualRes.data.length > 0) {
      const groups = new Map<string, number[]>();
      qualRes.data.forEach((m: any) => {
        const h = new Date(m.recorded_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        if (!groups.has(h)) groups.set(h, []);
        groups.get(h)!.push(m.mos || 0);
      });
      setQualityData(Array.from(groups.entries()).slice(-24).map(([time, vals]) => ({
        time,
        mos: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
      })));
    }

      // Call volume - grouper par heure (placeholder if cdr_history not available)
      setCallVolume([]);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      setCallVolume([]);
    }
  };

  useEffect(() => { if (ready) fetchAll(); }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [ready]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard Global</h1>
        <p className="text-sm text-muted-foreground">Vue temps reel de l infrastructure VoIP</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Link to="/sip-trunks"><KPICard title="SIP Trunks" value={stats.trunks} subtitle={`${stats.trunksUp} UP · ${stats.trunksDown} DOWN`} icon={Network} variant={stats.trunksDown > 0 ? "destructive" : "success"} className="cursor-pointer hover:ring-2 hover:ring-primary transition-all" /></Link>
        <Link to="/extensions"><KPICard title="Extensions" value={stats.extensions} subtitle={`${stats.extsOnline} en ligne`} icon={Phone} variant="primary" className="cursor-pointer hover:ring-2 hover:ring-primary transition-all" /></Link>
        <Link to="/calls"><KPICard title="Appels actifs" value={stats.activeCalls} subtitle="En cours" icon={PhoneCall} variant="success" className="cursor-pointer hover:ring-2 hover:ring-primary transition-all" /></Link>
        <Link to="/quality"><KPICard title="MOS moyen" value={stats.mos > 0 ? stats.mos.toFixed(2) : "—"} subtitle="24 dernieres heures" icon={Gauge} variant={stats.mos >= 4 ? "success" : stats.mos >= 3 ? "warning" : "destructive"} className="cursor-pointer hover:ring-2 hover:ring-primary transition-all" /></Link>
        <Link to="/alerts"><KPICard title="Alertes" value={stats.alerts} subtitle="Non acquittees" icon={AlertTriangle} variant={stats.alerts > 0 ? "destructive" : "default"} className="cursor-pointer hover:ring-2 hover:ring-primary transition-all" /></Link>
        <Link to="/ipbx"><KPICard title="IPBX" value={stats.trunksUp > 0 ? "Online" : "—"} subtitle="Statut global" icon={Activity} variant={stats.trunksDown > 0 ? "warning" : "success"} className="cursor-pointer hover:ring-2 hover:ring-primary transition-all" /></Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="noc-card p-4 border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> MOS Score (24h)
          </h3>
          {qualityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={qualityData}>
                <defs>
                  <linearGradient id="mosFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(185, 70%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(185, 70%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="time" {...axisStyle} />
                <YAxis domain={[1, 5]} {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="mos" stroke="hsl(185, 70%, 50%)" fill="url(#mosFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Aucune donnee RTCP disponible</div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="noc-card p-4 border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <PhoneCall size={16} className="text-success" /> Volume d appels (24h)
          </h3>
          {callVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={callVolume}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="h" {...axisStyle} />
                <YAxis {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="entrants" fill="hsl(185, 70%, 50%)" radius={[3,3,0,0]} />
                <Bar dataKey="sortants" fill="hsl(142, 70%, 45%)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Aucun appel dans les 24 dernieres heures</div>
          )}
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="noc-card p-4 border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Wifi size={16} className="text-primary" /> Statut SIP Trunks
          </h3>
          <div className="space-y-2">
            {trunks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun trunk configure</p>
            ) : trunks.map(trunk => (
              <div key={trunk.id} className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <StatusBadge status={trunk.status} />
                  <div>
                    <p className="text-sm font-mono font-medium text-foreground">{trunk.name}</p>
                    <p className="text-xs text-muted-foreground">{trunk.host || "—"}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold uppercase ${trunk.status === "up" ? "text-success" : "text-destructive"}`}>{trunk.status}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="noc-card p-4 border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-destructive" /> Alertes recentes
            {stats.alerts > 0 && <Link to="/alerts" className="ml-auto text-xs text-primary hover:underline">Voir tout</Link>}
          </h3>
          <div className="space-y-2">
            {recentAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune alerte non acquittee</p>
            ) : recentAlerts.map(alert => (
              <div key={alert.id} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/40">
                <StatusBadge status={alert.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    {new Date(alert.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
