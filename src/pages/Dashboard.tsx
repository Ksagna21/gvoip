import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/noc/StatusBadge";
import {
  Network, Phone, PhoneCall, Activity, AlertTriangle, TrendingUp, Gauge, Wifi,
  Settings, MoreHorizontal, Eye, ChevronUp, ChevronDown
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line
} from "recharts";
import { Link } from "react-router-dom";

/* ── Palette & helpers ───────────────────────────── */
const C = {
  blue:   "#4A90D9",
  red:    "#E05C5C",
  yellow: "#F5A623",
  green:  "#4CAF7D",
  purple: "#9B6DFF",
  cyan:   "#36C5F0",
  text:   "#2D3748",
  sub:    "#8896A4",
  border: "#E8EDF2",
  bg:     "#F4F7FB",
  card:   "#FFFFFF",
};

/* ── Circle Progress ─────────────────────────────── */
const CircleProgress = ({ value, max = 100, color, size = 56 }: { value: number; max?: number; color: string; size?: number }) => {
  const pct = Math.min(value / max, 1);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={5} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray .6s ease" }}
      />
    </svg>
  );
};

/* ── KPI Top Card ────────────────────────────────── */
const TopCard = ({
  label, value, suffix = "", delta, deltaLabel, color, circleVal, circleMax,
}: {
  label: string; value: string | number; suffix?: string; delta?: number;
  deltaLabel?: string; color: string; circleVal: number; circleMax?: number;
}) => {
  const up = (delta ?? 0) >= 0;
  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: "18px 20px",
      border: `1px solid ${C.border}`, display: "flex",
      alignItems: "center", justifyContent: "space-between",
      boxShadow: "0 2px 8px rgba(0,0,0,.05)", flex: 1,
    }}>
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.sub, textTransform: "uppercase", marginBottom: 6 }}>{label}</p>
        <p style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>
          {delta !== undefined && (
            <span style={{ fontSize: 13, fontWeight: 700, color: up ? C.green : C.red, marginRight: 4 }}>
              {up ? "▲" : "▼"} {Math.abs(delta)} %
            </span>
          )}
          {value}{suffix && <span style={{ fontSize: 14, fontWeight: 500, color: C.sub }}> {suffix}</span>}
        </p>
        {deltaLabel && <p style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{deltaLabel}</p>}
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircleProgress value={circleVal} max={circleMax} color={color} size={56} />
        <span style={{
          position: "absolute", fontSize: 11, fontWeight: 700,
          color, transform: "rotate(90deg)",
        }}>{circleVal}</span>
      </div>
    </div>
  );
};

/* ── Stat Bottom Card ────────────────────────────── */
const StatCard = ({ label, value, delta, color }: { label: string; value: string; delta: number; color: string }) => {
  const up = delta >= 0;
  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: "16px 20px",
      border: `1px solid ${C.border}`, flex: 1,
      boxShadow: "0 2px 8px rgba(0,0,0,.04)",
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.sub, textTransform: "uppercase", marginBottom: 8 }}>{label}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <p style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{value}</p>
        <span style={{ fontSize: 12, fontWeight: 700, color: up ? C.green : C.red }}>
          {up ? "▲" : "▼"} {Math.abs(delta)}%
        </span>
      </div>
    </div>
  );
};

/* ── Target Bar ──────────────────────────────────── */
const TargetBar = ({ label, pct, color }: { label: string; pct: number; color: string }) => (
  <div style={{ background: C.card, borderRadius: 12, padding: "16px 20px", border: `1px solid ${C.border}`, flex: 1, boxShadow: "0 2px 6px rgba(0,0,0,.04)" }}>
    <p style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>{pct}%</p>
    <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width .8s ease" }} />
    </div>
    <p style={{ fontSize: 11, color: C.sub }}>{label}</p>
  </div>
);

/* ── Tooltip styles ──────────────────────────────── */
const ttStyle = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,.1)" };
const gridSt = { strokeDasharray: "3 3", stroke: C.border };
const axisSt = { stroke: C.sub, fontSize: 10 };

/* ═══════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════ */
const Dashboard = () => {
  const [stats, setStats] = useState({
    trunks: 0, trunksUp: 0, trunksDown: 0,
    extensions: 0, extsOnline: 0,
    activeCalls: 0, alerts: 0, mos: 0,
  });
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
        applyFilter(supabase.from("alerts").select("id, type, title, message, created_at, acknowledged"))
          .eq("acknowledged", false).order("created_at", { ascending: false }).limit(5),
        supabase.from("quality_metrics").select("mos, jitter, recorded_at")
          .gte("recorded_at", new Date(Date.now() - 3600000 * 24).toISOString())
          .order("recorded_at", { ascending: true }),
      ]);

      const t = trunkRes.data || [];
      const e = extRes.data || [];
      const c = callRes.data || [];
      const a = alertRes.data || [];

      setTrunks(t);
      setRecentAlerts(a);
      setStats({
        trunks: t.length,
        trunksUp: t.filter((x: any) => x.status === "up").length,
        trunksDown: t.filter((x: any) => x.status === "down").length,
        extensions: e.length,
        extsOnline: e.filter((x: any) => x.status === "registered").length,
        activeCalls: c.length,
        alerts: a.length,
        mos: qualRes.data?.length
          ? parseFloat((qualRes.data.reduce((s: number, m: any) => s + (m.mos || 0), 0) / qualRes.data.length).toFixed(2))
          : 0,
      });

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

      const since24h = new Date(Date.now() - 3600000 * 24).toISOString();
      const cdrRes = await applyFilter(
        supabase.from("calls").select("trunk_name, started_at, duration")
          .gte("started_at", since24h).order("started_at", { ascending: true })
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

  /* Derived display values */
  const mosTarget = stats.mos > 0 ? Math.round((stats.mos / 5) * 100) : 0;
  const extTarget  = stats.extensions > 0 ? Math.round((stats.extsOnline / stats.extensions) * 100) : 0;
  const trunkTarget = stats.trunks > 0 ? Math.round((stats.trunksUp / stats.trunks) * 100) : 0;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 28px", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Dashboard Global</h1>
        <p style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>Vue temps réel de l'infrastructure VoIP</p>
      </div>

      {/* Top KPI Cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <Link to="/sip-trunks" style={{ flex: 1, minWidth: 180, textDecoration: "none" }}>
          <TopCard label="SIP Trunks" value={stats.trunks} delta={stats.trunksDown > 0 ? -stats.trunksDown : stats.trunksUp} deltaLabel={`${stats.trunksUp} UP · ${stats.trunksDown} DOWN`} color={stats.trunksDown > 0 ? C.red : C.green} circleVal={stats.trunksUp} circleMax={Math.max(stats.trunks, 1)} />
        </Link>
        <Link to="/extensions" style={{ flex: 1, minWidth: 180, textDecoration: "none" }}>
          <TopCard label="Extensions" value={stats.extensions} delta={extTarget} deltaLabel={`${stats.extsOnline} en ligne`} color={C.blue} circleVal={stats.extsOnline} circleMax={Math.max(stats.extensions, 1)} />
        </Link>
        <Link to="/calls" style={{ flex: 1, minWidth: 180, textDecoration: "none" }}>
          <TopCard label="Appels actifs" value={stats.activeCalls} suffix="appels" deltaLabel="En cours" color={C.yellow} circleVal={stats.activeCalls} circleMax={Math.max(stats.activeCalls, 50)} />
        </Link>
        <Link to="/alerts" style={{ flex: 1, minWidth: 180, textDecoration: "none" }}>
          <TopCard label="Alertes" value={stats.alerts} suffix="actives" deltaLabel="Non acquittées" color={stats.alerts > 0 ? C.red : C.green} circleVal={stats.alerts} circleMax={Math.max(stats.alerts, 10)} />
        </Link>
      </div>

      {/* Main charts row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>

        {/* Traffic / Call Volume — large */}
        <div style={{ flex: 2, background: C.card, borderRadius: 12, padding: "20px 22px", border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.05)", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>Volume d'appels (24h)</h3>
            <button style={{ background: C.yellow, color: "#fff", border: "none", borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Actions</button>
          </div>
          {callVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={callVolume} barCategoryGap="30%">
                <CartesianGrid {...gridSt} />
                <XAxis dataKey="h" {...axisSt} tick={{ fill: C.sub, fontSize: 10 }} />
                <YAxis {...axisSt} tick={{ fill: C.sub, fontSize: 10 }} />
                <Tooltip contentStyle={ttStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="entrants" name="Total appels" fill={C.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            /* Fallback demo data */
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[
                { h: "08:00", entrants: 12 }, { h: "09:00", entrants: 28 },
                { h: "10:00", entrants: 45 }, { h: "11:00", entrants: 63 },
                { h: "12:00", entrants: 22 }, { h: "13:00", entrants: 18 },
                { h: "14:00", entrants: 54 }, { h: "15:00", entrants: 71 },
                { h: "16:00", entrants: 38 }, { h: "17:00", entrants: 29 },
              ]} barCategoryGap="30%">
                <CartesianGrid {...gridSt} />
                <XAxis dataKey="h" tick={{ fill: C.sub, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.sub, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttStyle} />
                <Bar dataKey="entrants" name="Appels" fill={C.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* MOS / Income Donut-style */}
        <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "20px 22px", border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.05)", minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>Score MOS</h3>
            <Settings size={15} color={C.sub} />
          </div>

          {/* Big donut */}
          <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
            <div style={{ position: "relative", width: 130, height: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={130} height={130} style={{ transform: "rotate(-90deg)", position: "absolute" }}>
                {/* BG ring */}
                <circle cx={65} cy={65} r={52} fill="none" stroke={C.border} strokeWidth={12} />
                {/* Green segment */}
                <circle cx={65} cy={65} r={52} fill="none" stroke={C.green}
                  strokeWidth={12} strokeDasharray={`${2 * Math.PI * 52 * mosTarget / 100} ${2 * Math.PI * 52 * (1 - mosTarget / 100)}`} strokeLinecap="round" />
                {/* Blue segment offset */}
                <circle cx={65} cy={65} r={52} fill="none" stroke={C.blue}
                  strokeWidth={12} strokeDasharray={`${2 * Math.PI * 52 * 0.25} ${2 * Math.PI * 52 * 0.75}`}
                  strokeDashoffset={-2 * Math.PI * 52 * mosTarget / 100}
                  strokeLinecap="round" opacity={0.4} />
              </svg>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>Score</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.1 }}>
                  {stats.mos > 0 ? stats.mos.toFixed(1) : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Spending Target row */}
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${trunkTarget}%`, height: "100%", background: C.yellow, borderRadius: 99 }} />
            </div>
            <p style={{ fontSize: 11, color: C.sub }}><span style={{ color: C.yellow, fontWeight: 700 }}>{trunkTarget}%</span> Trunks opérationnels</p>
          </div>
        </div>
      </div>

      {/* Stat cards row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Extensions" value={`${stats.extsOnline} / ${stats.extensions}`} delta={extTarget - 50} color={C.blue} />
        <StatCard label="Alertes actives" value={`${stats.alerts}`} delta={stats.alerts > 0 ? -stats.alerts * 10 : 0} color={C.red} />
        <StatCard label="Appels actifs" value={`${stats.activeCalls}`} delta={8} color={C.yellow} />
        <StatCard label="MOS moyen" value={stats.mos > 0 ? stats.mos.toFixed(2) : "—"} delta={stats.mos >= 4 ? 14 : -5} color={C.green} />
      </div>

      {/* Bottom: Trunks + Alerts + MOS chart */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>

        {/* SIP Trunks list */}
        <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "20px 22px", border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.05)", minWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>Statut SIP Trunks</h3>
            <Wifi size={15} color={C.blue} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {trunks.length === 0 ? (
              <p style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Aucun trunk configuré</p>
            ) : trunks.map(trunk => (
              <div key={trunk.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: 8, background: C.bg,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: trunk.status === "up" ? C.green : C.red,
                    boxShadow: `0 0 6px ${trunk.status === "up" ? C.green : C.red}`,
                  }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{trunk.name}</p>
                    <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>{trunk.host || "—"}</p>
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99,
                  background: trunk.status === "up" ? `${C.green}18` : `${C.red}18`,
                  color: trunk.status === "up" ? C.green : C.red,
                  textTransform: "uppercase", letterSpacing: 0.8,
                }}>{trunk.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MOS chart */}
        <div style={{ flex: 1.5, background: C.card, borderRadius: 12, padding: "20px 22px", border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.05)", minWidth: 280 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>MOS Score (24h)</h3>
            <TrendingUp size={15} color={C.green} />
          </div>
          {qualityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={qualityData}>
                <defs>
                  <linearGradient id="mosFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.green} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridSt} />
                <XAxis dataKey="time" tick={{ fill: C.sub, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[1, 5]} tick={{ fill: C.sub, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttStyle} />
                <Area type="monotone" dataKey="mos" stroke={C.green} fill="url(#mosFill)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontSize: 13 }}>
              Aucune donnée RTCP disponible
            </div>
          )}
        </div>

        {/* Alerts */}
        <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "20px 22px", border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.05)", minWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>Alertes récentes</h3>
            {stats.alerts > 0 && <Link to="/alerts" style={{ fontSize: 11, color: C.blue, textDecoration: "none", fontWeight: 600 }}>Voir tout</Link>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentAlerts.length === 0 ? (
              <p style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Aucune alerte non acquittée</p>
            ) : recentAlerts.map(alert => (
              <div key={alert.id} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: alert.type === "critical" ? C.red : C.yellow, marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{alert.title}</p>
                  <p style={{ fontSize: 11, color: C.sub, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{alert.message}</p>
                  <p style={{ fontSize: 10, color: C.sub, margin: "4px 0 0", fontFamily: "monospace" }}>
                    {new Date(alert.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Target Section */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>Target Section</h3>
          <Link to="/quality" style={{ fontSize: 12, color: C.blue, textDecoration: "none", fontWeight: 600 }}>View Details</Link>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <TargetBar label="Score MOS Target" pct={mosTarget} color={C.red} />
          <TargetBar label="Extensions en ligne" pct={extTarget} color={C.green} />
          <TargetBar label="Trunks opérationnels" pct={trunkTarget} color={C.yellow} />
          <TargetBar label="Disponibilité globale" pct={stats.trunksDown === 0 ? 99 : Math.max(0, 100 - stats.trunksDown * 10)} color={C.blue} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
