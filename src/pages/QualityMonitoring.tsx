import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Gauge, Zap, WifiOff, RefreshCw } from "lucide-react";
import { KPICard } from "@/components/noc/KPICard";
import { motion } from "framer-motion";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Metric {
  mos: number;
  jitter: number;
  packet_loss: number;
  rtt: number;
  recorded_at: string;
}

interface ChartPoint {
  time: string;
  mos: number;
  jitter: number;
  packetLoss: number;
  rtt: number;
}

interface IPBX { id: string; name: string; }

const tooltipStyle = {
  background: "hsl(220, 18%, 10%)",
  border: "1px solid hsl(220, 14%, 18%)",
  borderRadius: 8,
  fontSize: 12
};

const gridStyle = { strokeDasharray: "3 3", stroke: "hsl(220, 14%, 18%)" };
const axisStyle = { stroke: "hsl(215, 15%, 55%)", fontSize: 10 };

const QualityMonitoring = () => {
  const { applyFilter, allowedIpbxIds, isAdmin, ready } = useAllowedIpbx();
  const [metrics, setMetrics] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("1h");
  const [ipbxFilter, setIpbxFilter] = useState("all");
  const [ipbxList, setIpbxList] = useState<IPBX[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    if (!ready) return;
    let q = supabase.from("ipbx").select("id, name").order("name");
    if (!isAdmin && allowedIpbxIds && allowedIpbxIds.length > 0)
      q = q.in("id", allowedIpbxIds) as any;
    else if (!isAdmin)
      q = q.in("id", ["00000000-0000-0000-0000-000000000000"]) as any;
    q.then(({ data }) => { if (data) setIpbxList(data as IPBX[]); });
  }, [ready, isAdmin, allowedIpbxIds]);

  const fetchMetrics = async () => {
    setLoading(true);
    const now = new Date();
    const periodMap: Record<string, number> = {
      "1h": 1, "6h": 6, "24h": 24, "7d": 168
    };
    const hours = periodMap[period] || 1;
    const from = new Date(now.getTime() - hours * 3600000).toISOString();

    let query = applyFilter(supabase.from("quality_metrics"))
      .select("mos, jitter, packet_loss, rtt, recorded_at")
      .gte("recorded_at", from)
      .order("recorded_at", { ascending: true });

    if (ipbxFilter !== "all") query = query.eq("ipbx_id", ipbxFilter);

    const { data } = await query;

    if (data && data.length > 0) {
      const intervalMs = hours <= 1 ? 60000 : hours <= 6 ? 300000 : hours <= 24 ? 1800000 : 7200000;
      const groups = new Map<number, Metric[]>();

      data.forEach((m: Metric) => {
        const t = new Date(m.recorded_at).getTime();
        const bucket = Math.floor(t / intervalMs) * intervalMs;
        if (!groups.has(bucket)) groups.set(bucket, []);
        groups.get(bucket)!.push(m);
      });

      const points: ChartPoint[] = Array.from(groups.entries())
        .sort(([a], [b]) => a - b)
        .map(([ts, items]) => ({
          time: new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          mos: parseFloat((items.reduce((s, i) => s + (i.mos || 0), 0) / items.length).toFixed(2)),
          jitter: parseFloat((items.reduce((s, i) => s + (i.jitter || 0), 0) / items.length).toFixed(2)),
          packetLoss: parseFloat((items.reduce((s, i) => s + (i.packet_loss || 0), 0) / items.length).toFixed(2)),
          rtt: parseFloat((items.reduce((s, i) => s + (i.rtt || 0), 0) / items.length).toFixed(2)),
        }));

      setMetrics(points);
    } else {
      setMetrics([]);
    }
    setLastUpdate(new Date());
    setLoading(false);
  };

  useEffect(() => { if (ready) fetchMetrics(); }, [period, ipbxFilter, ready]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [period, ipbxFilter, ready]);

  const avg = metrics.length > 0 ? {
    mos: parseFloat((metrics.reduce((s, m) => s + m.mos, 0) / metrics.length).toFixed(2)),
    jitter: parseFloat((metrics.reduce((s, m) => s + m.jitter, 0) / metrics.length).toFixed(2)),
    packetLoss: parseFloat((metrics.reduce((s, m) => s + m.packetLoss, 0) / metrics.length).toFixed(2)),
    rtt: parseFloat((metrics.reduce((s, m) => s + m.rtt, 0) / metrics.length).toFixed(2)),
  } : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Qualite VoIP</h1>
          <p className="text-sm text-muted-foreground">Monitoring RTCP en temps reel - {lastUpdate.toLocaleTimeString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={ipbxFilter} onValueChange={setIpbxFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les IPBX</SelectItem>
              {ipbxList.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1 heure</SelectItem>
              <SelectItem value="6h">6 heures</SelectItem>
              <SelectItem value="24h">24 heures</SelectItem>
              <SelectItem value="7d">7 jours</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {avg ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="MOS Score" value={avg.mos.toFixed(2)} subtitle="Moyenne periode" icon={Gauge}
            variant={avg.mos >= 4 ? "success" : avg.mos >= 3 ? "warning" : "destructive"} />
          <KPICard title="Jitter" value={`${avg.jitter.toFixed(1)}ms`} subtitle="Variation delai" icon={Zap}
            variant={avg.jitter < 10 ? "success" : avg.jitter < 30 ? "warning" : "destructive"} />
          <KPICard title="Packet Loss" value={`${avg.packetLoss.toFixed(2)}%`} subtitle="Perte paquets" icon={WifiOff}
            variant={avg.packetLoss < 1 ? "success" : avg.packetLoss < 3 ? "warning" : "destructive"} />
          <KPICard title="RTT" value={`${avg.rtt.toFixed(0)}ms`} subtitle="Round-trip time" icon={Activity}
            variant={avg.rtt < 50 ? "success" : avg.rtt < 150 ? "warning" : "destructive"} />
        </div>
      ) : (
        <div className="noc-card p-8 text-center border border-border">
          <Activity className="mx-auto text-muted-foreground mb-2" size={32} />
          <p className="text-muted-foreground">Aucune donnee RTCP sur cette periode</p>
          <p className="text-xs text-muted-foreground mt-1">Les metriques apparaissent pendant les appels actifs</p>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="noc-card border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">MOS Score</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="mosGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="time" {...axisStyle} />
                <YAxis domain={[1, 5]} {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="mos" stroke="hsl(142, 70%, 45%)" fill="url(#mosGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="noc-card border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Jitter (ms)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="jitterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(38, 92%, 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(38, 92%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="time" {...axisStyle} />
                <YAxis {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="jitter" stroke="hsl(38, 92%, 55%)" fill="url(#jitterGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="noc-card border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Packet Loss (%)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="plGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="time" {...axisStyle} />
                <YAxis {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="packetLoss" stroke="hsl(0, 72%, 55%)" fill="url(#plGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="noc-card border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">RTT (ms)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={metrics}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="time" {...axisStyle} />
                <YAxis {...axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="rtt" stroke="hsl(185, 70%, 50%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default QualityMonitoring;
