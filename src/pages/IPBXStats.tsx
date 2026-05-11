import React, { useEffect, useState, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, RefreshCw, Cpu, HardDrive, Thermometer,
  MemoryStick, AlertTriangle, CheckCircle2, XCircle, Wifi,
  PhoneCall, Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ──────────────────────────────────────────────────────── */
export interface IPBX {
  id: string;
  name: string;
  host: string;
  ip_address: string;
  type: string;
  status: string;
  country_id: string;
  api_url: string;
  api_user: string;
  api_password: string;
  ami_user: string;
  ami_password: string;
  ami_port: number;
  ssh_user: string;
  ssh_password: string;
  ssh_sudo_password: string;
  countries?: { name: string; code: string };
}

interface SystemStats {
  // Système
  cpu: number;
  ram_used: number;
  ram_total: number;
  storage_used: number;
  storage_total: number;
  temperature: number;
  uptime: string;
  load_avg: string;
  // Asterisk (données AMI réelles)
  active_calls: number;
  processed_calls: number;
  asterisk_version: string;
  sip_peers_total: number;
  sip_peers_online: number;
  timestamp: string;
}

interface IPBXStatsProps {
  ipbx: IPBX;
  onBack: () => void;
}

/* ─── Config proxy AMI ───────────────────────────────────────────── */
/**
 * URL du proxy Node.js (ami-stats-server.js).
 * En développement : http://localhost:3001
 * En production    : votre domaine / reverse-proxy (ex: /ami-proxy)
 */
const AMI_PROXY_URL =
  (import.meta as any).env?.VITE_AMI_PROXY_URL ??
  // En prod: même origine (à utiliser avec un reverse-proxy Nginx: /ami-proxy)
  (typeof window !== "undefined" && window.location.hostname !== "localhost" ? "" : "http://localhost:3001");

/* ─── Helpers ────────────────────────────────────────────────────── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function getLevel(pct: number, warn = 60, crit = 85): "ok" | "warn" | "crit" {
  if (pct >= crit) return "crit";
  if (pct >= warn) return "warn";
  return "ok";
}

const COLORS = {
  ok:   { stroke: "#22d3ee", glow: "#22d3ee40", text: "text-cyan-500",  bg: "bg-cyan-500/10"  },
  warn: { stroke: "#f59e0b", glow: "#f59e0b40", text: "text-amber-500", bg: "bg-amber-500/10" },
  crit: { stroke: "#ef4444", glow: "#ef444440", text: "text-red-500",   bg: "bg-red-500/10"   },
};

/* ─── Arc Gauge ──────────────────────────────────────────────────── */
function ArcGauge({
  value, label, sublabel, icon, level, unit = "%",
}: {
  value: number; label: string; sublabel?: string;
  icon: ReactNode; level: "ok" | "warn" | "crit"; unit?: string;
}) {
  const { stroke, glow, text, bg } = COLORS[level];
  const SIZE = 140;
  const R = 52;
  const cx = SIZE / 2;
  const cy = SIZE / 2 + 8;
  const START = 210;
  const SWEEP = 240;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (s: number, e: number) => {
    const x1 = cx + R * Math.cos(toRad(s)), y1 = cy + R * Math.sin(toRad(s));
    const x2 = cx + R * Math.cos(toRad(e)), y2 = cy + R * Math.sin(toRad(e));
    return `M ${x1} ${y1} A ${R} ${R} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const angle = START + (Math.min(value, 100) / 100) * SWEEP;
  const [disp, setDisp] = useState(0);

  useEffect(() => {
    const t0 = performance.now();
    const frame = (now: number) => {
      const p = Math.min((now - t0) / 900, 1);
      setDisp(Math.round(lerp(0, value, 1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [value]);

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border border-border ${bg} p-4`}
      style={{ background: `radial-gradient(ellipse at 50% 0%, ${glow} 0%, transparent 70%)` }}
    >
      <svg width={SIZE} height={SIZE} overflow="visible">
        <path d={arc(START, START + SWEEP)} fill="none" stroke="hsl(var(--border))" strokeWidth={8} strokeLinecap="round" />
        <path
          d={arc(START, angle)} fill="none" stroke={stroke} strokeWidth={8} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${stroke})`, transition: "all 0.9s cubic-bezier(0.34,1.4,0.64,1)" }}
        />
        <foreignObject x={cx - 12} y={cy - 30} width={24} height={24}>
          <div style={{ color: stroke, display: "flex" }}>{icon}</div>
        </foreignObject>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={22} fontWeight="700" fill={stroke} fontFamily="monospace">
          {disp}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))" fontFamily="monospace">
          {unit}
        </text>
      </svg>
      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mt-1">{label}</p>
      {sublabel && <p className={`text-[10px] mt-0.5 font-mono ${text}`}>{sublabel}</p>}
    </div>
  );
}

/* ─── Horizontal Bar ─────────────────────────────────────────────── */
function HBar({ label, value, max, unit, level, icon }: {
  label: string; value: number; max: number;
  unit: string; level: "ok" | "warn" | "crit"; icon: ReactNode;
}) {
  const { stroke, text } = COLORS[level];
  const pct = Math.min((value / max) * 100, 100);
  const [disp, setDisp] = useState(0);

  useEffect(() => {
    const t0 = performance.now();
    const frame = (now: number) => {
      const p = Math.min((now - t0) / 800, 1);
      setDisp(lerp(0, pct, 1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [pct]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: stroke }}>
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <span className={`text-[11px] font-mono ${text}`}>
          {typeof value === "number" ? value.toFixed(1) : value} / {max} {unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${disp}%`, background: `linear-gradient(90deg, ${stroke}80, ${stroke})` }}
        />
      </div>
    </div>
  );
}

/* ─── Status Badge ───────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: ReactNode; label: string; cls: string }> = {
    online:  { icon: <CheckCircle2 size={12} />, label: "En ligne",   cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    offline: { icon: <XCircle size={12} />,      label: "Hors ligne", cls: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30" },
    error:   { icon: <AlertTriangle size={12} />, label: "Erreur",    cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30" },
  };
  const s = map[status] ?? {
    icon: <Wifi size={12} />,
    label: status || "Inconnu",
    cls: "text-muted-foreground bg-muted/30 border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

/* ─── Stat Card (Appels / Peers) ─────────────────────────────────── */
function StatCard({ label, value, sub, icon, color }: {
  label: string; value: number | string; sub?: string;
  icon: ReactNode; color: string;
}) {
  return (
    <div
      className="noc-card border border-border px-4 py-4 flex items-center gap-3"
      style={{ background: `radial-gradient(ellipse at 0% 50%, ${color}18 0%, transparent 60%)` }}
    >
      <div className="p-2 rounded-xl" style={{ background: `${color}20`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xl font-mono font-bold" style={{ color }}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── fetchStats — appel réel vers le proxy AMI ──────────────────── */
async function fetchStats(ipbx: IPBX): Promise<SystemStats> {
  const res = await fetch(`${AMI_PROXY_URL}/api/ipbx/stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host:         ipbx.ip_address || ipbx.host,
      ami_port:     ipbx.ami_port   || 5038,
      ami_user:     ipbx.ami_user,
      ami_password: ipbx.ami_password,
      ssh_user:     ipbx.ssh_user,
      ssh_password: ipbx.ssh_password,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Erreur serveur (${res.status})`);
  }

  const data = await res.json();
  return data as SystemStats;
}

/* ─── Main ───────────────────────────────────────────────────────── */
const IPBXStats = ({ ipbx, onBack }: IPBXStatsProps) => {
  const [stats, setStats]             = useState<SystemStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setStats(await fetchStats(ipbx));
    } catch (e: any) {
      setError(e?.message || "Impossible de récupérer les statistiques AMI");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ipbx]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(true), 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const ramPct       = stats ? (stats.ram_used / (stats.ram_total || 8)) * 100 : 0;
  const storagePct   = stats ? (stats.storage_used / (stats.storage_total || 100)) * 100 : 0;
  const cpuLevel     = stats ? getLevel(stats.cpu) : "ok";
  const ramLevel     = getLevel(ramPct);
  const storageLevel = getLevel(storagePct);
  const tempLevel    = stats ? getLevel(stats.temperature, 65, 80) : "ok";

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 border border-border hover:border-primary/40" onClick={onBack}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{ipbx.name}</h1>
              <StatusBadge status={ipbx.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {ipbx.type} · {ipbx.ip_address || ipbx.host}
              {ipbx.countries ? ` · ${ipbx.countries.name}` : ""}
              {stats?.asterisk_version ? ` · Asterisk ${stats.asterisk_version}` : ""}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`text-[11px] px-3 py-1.5 rounded-lg border font-mono transition-all ${
              autoRefresh
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400"
                : "border-border text-muted-foreground hover:border-border/60"
            }`}
          >
            {autoRefresh ? "● Live" : "⏸ Pause"}
          </button>
          <Button
            variant="outline" size="sm"
            onClick={() => { setRefreshing(true); load(true); }}
            disabled={refreshing || loading}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* ── Erreur ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-sm"
          >
            <AlertTriangle size={16} />
            <div>
              <p className="font-semibold">Erreur de connexion AMI</p>
              <p className="text-xs mt-0.5 opacity-80">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Skeleton ── */}
      {loading && !stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Cartes Asterisk (appels & peers) ── */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <StatCard
            label="Appels actifs"
            value={stats.active_calls}
            sub="canaux en cours"
            icon={<PhoneCall size={18} />}
            color="#22d3ee"
          />
          <StatCard
            label="Appels traités"
            value={stats.processed_calls.toLocaleString("fr-FR")}
            sub="depuis le démarrage"
            icon={<PhoneCall size={18} />}
            color="#a78bfa"
          />
          <StatCard
            label="Peers SIP"
            value={`${stats.sip_peers_online} / ${stats.sip_peers_total}`}
            sub="enregistrés / total"
            icon={<Users size={18} />}
            color="#34d399"
          />
          <StatCard
            label="Uptime"
            value={stats.uptime || "—"}
            sub="depuis dernier redémarrage"
            icon={<CheckCircle2 size={18} />}
            color="#f59e0b"
          />
        </motion.div>
      )}

      {/* ── Gauges système ── */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <ArcGauge value={stats.cpu} label="CPU"
            sublabel={`Load: ${stats.load_avg.split(" ")[0]}`}
            icon={<Cpu size={20} />} level={cpuLevel} />
          <ArcGauge value={Math.round(ramPct)} label="RAM"
            sublabel={`${stats.ram_used.toFixed(1)} / ${stats.ram_total} Go`}
            icon={<MemoryStick size={20} />} level={ramLevel} />
          <ArcGauge value={Math.round(storagePct)} label="Stockage"
            sublabel={`${stats.storage_used.toFixed(0)} / ${stats.storage_total} Go`}
            icon={<HardDrive size={20} />} level={storageLevel} />
          <ArcGauge value={stats.temperature} label="Température"
            sublabel={`${stats.temperature} °C`}
            icon={<Thermometer size={20} />} level={tempLevel} unit="°C" />
        </motion.div>
      )}

      {/* ── Barres détail ── */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
          className="noc-card border border-border p-5 space-y-4"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Détail des ressources
          </p>
          <HBar label="CPU"         value={stats.cpu}          max={100}                  unit="%"  level={cpuLevel}     icon={<Cpu size={13} />} />
          <HBar label="RAM"         value={stats.ram_used}     max={stats.ram_total || 8} unit="Go" level={ramLevel}     icon={<MemoryStick size={13} />} />
          <HBar label="Stockage"    value={stats.storage_used} max={stats.storage_total || 100} unit="Go" level={storageLevel} icon={<HardDrive size={13} />} />
          <HBar label="Température" value={stats.temperature}  max={100}                  unit="°C" level={tempLevel}    icon={<Thermometer size={13} />} />
        </motion.div>
      )}

      {/* ── Info cards bas de page ── */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {[
            { label: "Load avg",        value: stats.load_avg },
            { label: "Asterisk",        value: stats.asterisk_version || "—" },
            { label: "Température",     value: `${stats.temperature} °C` },
            { label: "Mis à jour",      value: stats.timestamp },
          ].map(({ label, value }) => (
            <div key={label} className="noc-card border border-border px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-mono text-foreground truncate">{value}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Légende ── */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground font-mono">
        {[
          { level: "ok",   label: "Normal < 60%"    },
          { level: "warn", label: "Attention 60–85%" },
          { level: "crit", label: "Critique > 85%"  },
        ].map(({ level, label }) => (
          <span key={level} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[level as "ok"].stroke }} />
            {label}
          </span>
        ))}
      </div>

    </div>
  );
};

export default IPBXStats;
