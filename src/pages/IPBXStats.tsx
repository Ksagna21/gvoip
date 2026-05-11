import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, RefreshCw, Cpu, HardDrive, Thermometer,
  MemoryStick, AlertTriangle, CheckCircle2, XCircle, Wifi,
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
  cpu: number;
  ram_used: number;
  ram_total: number;
  storage_used: number;
  storage_total: number;
  temperature: number;
  uptime: string;
  load_avg: string;
  timestamp: string;
}

interface IPBXStatsProps {
  ipbx: IPBX;
  onBack: () => void;
}

/* ─── Helpers ────────────────────────────────────────────────────── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function getLevel(pct: number, warn = 60, crit = 85): "ok" | "warn" | "crit" {
  if (pct >= crit) return "crit";
  if (pct >= warn) return "warn";
  return "ok";
}

const COLORS = {
  ok:   { stroke: "#22d3ee", glow: "#22d3ee40", text: "text-cyan-400",  bg: "bg-cyan-500/10"  },
  warn: { stroke: "#f59e0b", glow: "#f59e0b40", text: "text-amber-400", bg: "bg-amber-500/10" },
  crit: { stroke: "#ef4444", glow: "#ef444440", text: "text-red-400",   bg: "bg-red-500/10"   },
};

/* ─── Arc Gauge ──────────────────────────────────────────────────── */
function ArcGauge({
  value, label, sublabel, icon, level, unit = "%",
}: {
  value: number; label: string; sublabel?: string;
  icon: React.ReactNode; level: "ok" | "warn" | "crit"; unit?: string;
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
      className={`flex flex-col items-center rounded-2xl border border-white/5 ${bg} p-4`}
      style={{ background: `radial-gradient(ellipse at 50% 0%, ${glow} 0%, transparent 70%)` }}
    >
      <svg width={SIZE} height={SIZE} overflow="visible">
        <path d={arc(START, START + SWEEP)} fill="none" stroke="#ffffff10" strokeWidth={8} strokeLinecap="round" />
        <path d={arc(START, angle)} fill="none" stroke={stroke} strokeWidth={8} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${stroke})`, transition: "all 0.9s cubic-bezier(0.34,1.4,0.64,1)" }} />
        <foreignObject x={cx - 12} y={cy - 30} width={24} height={24}>
          <div style={{ color: stroke, display: "flex" }}>{icon}</div>
        </foreignObject>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={22} fontWeight="700" fill={stroke} fontFamily="monospace">
          {disp}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fill="#ffffff55" fontFamily="monospace">
          {unit}
        </text>
      </svg>
      <p className="text-[10px] font-semibold tracking-widest uppercase text-white/60 mt-1">{label}</p>
      {sublabel && <p className={`text-[10px] mt-0.5 font-mono ${text}`}>{sublabel}</p>}
    </div>
  );
}

/* ─── Horizontal Bar ─────────────────────────────────────────────── */
function HBar({ label, value, max, unit, level, icon }: {
  label: string; value: number; max: number;
  unit: string; level: "ok" | "warn" | "crit"; icon: React.ReactNode;
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
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{label}</span>
        </div>
        <span className={`text-[11px] font-mono ${text}`}>
          {value.toFixed(1)} / {max} {unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full"
          style={{ width: `${disp}%`, background: `linear-gradient(90deg, ${stroke}80, ${stroke})` }} />
      </div>
    </div>
  );
}

/* ─── Status Badge ───────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    online:  { icon: <CheckCircle2 size={12} />, label: "En ligne",   cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    offline: { icon: <XCircle size={12} />,      label: "Hors ligne", cls: "text-red-400 bg-red-500/10 border-red-500/30" },
    error:   { icon: <AlertTriangle size={12} />, label: "Erreur",    cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  };
  const s = map[status] ?? { icon: <Wifi size={12} />, label: status || "Inconnu", cls: "text-white/40 bg-white/5 border-white/10" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

/* ─── fetchStats — remplacer par votre API réelle ────────────────── */
async function fetchStats(ipbx: IPBX): Promise<SystemStats> {
  // TODO: remplacer par votre endpoint :
  // const res = await fetch(`/api/ipbx/${ipbx.id}/stats`);
  // if (!res.ok) throw new Error("Erreur serveur");
  // return res.json();
  await new Promise((r) => setTimeout(r, 600));
  const seed = ipbx.id.charCodeAt(0) + (Date.now() % 30);
  const n = (range: number, offset = 0) =>
    Math.max(0, Math.min(100, offset + Math.sin(seed * 0.1 + Date.now() * 0.00003) * range + range * 0.5));
  const ram_total = 8, storage_total = 100;
  return {
    cpu: Math.round(n(60, 10)),
    ram_used: Math.min(parseFloat(n(5, 1.5).toFixed(1)), ram_total),
    ram_total,
    storage_used: Math.min(parseFloat(n(30, 20).toFixed(1)), storage_total),
    storage_total,
    temperature: Math.round(n(35, 38)),
    uptime: "14d 07h 43m",
    load_avg: "0.42 0.55 0.61",
    timestamp: new Date().toLocaleTimeString("fr-FR"),
  };
}

/* ─── Main ───────────────────────────────────────────────────────── */
const IPBXStats = ({ ipbx, onBack }: IPBXStatsProps) => {
  const [stats, setStats]       = useState<SystemStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setStats(await fetchStats(ipbx));
    } catch (e: any) {
      setError(e?.message || "Impossible de récupérer les statistiques");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ipbx]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(true), 10000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const ramPct      = stats ? (stats.ram_used / stats.ram_total) * 100 : 0;
  const storagePct  = stats ? (stats.storage_used / stats.storage_total) * 100 : 0;
  const cpuLevel    = stats ? getLevel(stats.cpu) : "ok";
  const ramLevel    = getLevel(ramPct);
  const storageLevel = getLevel(storagePct);
  const tempLevel   = stats ? getLevel(stats.temperature, 65, 80) : "ok";

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white">
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-500/5 blur-3xl" />
        <div className="absolute top-1/2 -right-24 w-72 h-72 rounded-full bg-blue-600/5 blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.025]">
          <defs>
            <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#fff" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon"
              className="h-9 w-9 rounded-xl border border-white/10 hover:border-cyan-400/40 hover:text-cyan-400 text-white"
              onClick={onBack}>
              <ArrowLeft size={16} />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white font-mono">{ipbx.name}</h1>
                <StatusBadge status={ipbx.status} />
              </div>
              <p className="text-xs text-white/40 mt-0.5 font-mono">
                {ipbx.type} · {ipbx.ip_address || ipbx.host}{ipbx.countries ? ` · ${ipbx.countries.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`text-[11px] px-3 py-1.5 rounded-lg border font-mono transition-all ${
                autoRefresh
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                  : "border-white/10 text-white/30 hover:border-white/20"
              }`}>
              {autoRefresh ? "● Live" : "⏸ Pause"}
            </button>
            <Button variant="outline" size="sm"
              className="h-8 gap-1.5 border-white/10 hover:border-cyan-400/40 hover:text-cyan-400 text-xs text-white/70 font-mono"
              onClick={() => { setRefreshing(true); load(true); }}
              disabled={refreshing || loading}>
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              Actualiser
            </Button>
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
              <AlertTriangle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skeleton */}
        {loading && !stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        )}

        {/* Gauges */}
        {stats && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            </div>
          </motion.div>
        )}

        {/* Bars */}
        {stats && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }}
            className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Détail des ressources</p>
            <HBar label="CPU"         value={stats.cpu}          max={100}                unit="%"  level={cpuLevel}     icon={<Cpu size={13} />} />
            <HBar label="RAM"         value={stats.ram_used}     max={stats.ram_total}    unit="Go" level={ramLevel}     icon={<MemoryStick size={13} />} />
            <HBar label="Stockage"    value={stats.storage_used} max={stats.storage_total} unit="Go" level={storageLevel} icon={<HardDrive size={13} />} />
            <HBar label="Température" value={stats.temperature}  max={100}                unit="°C" level={tempLevel}    icon={<Thermometer size={13} />} />
          </motion.div>
        )}

        {/* Info cards */}
        {stats && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.14 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Uptime",      value: stats.uptime },
              { label: "Load avg",    value: stats.load_avg },
              { label: "Température", value: `${stats.temperature} °C` },
              { label: "Mis à jour",  value: stats.timestamp },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-xs font-mono text-white/75 truncate">{value}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-5 text-[10px] text-white/25 font-mono">
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
    </div>
  );
};

export default IPBXStats;
