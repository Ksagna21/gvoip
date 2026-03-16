import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { RefreshCw, Maximize2, ZoomIn, ZoomOut, RotateCcw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────────────────
interface IPBX {
  id: string;
  name: string;
  ip_address: string;
  status: string;
  ping_latency: number | null;
  country_id: string | null;
}

interface SipTrunk {
  id: string;
  name: string;
  ipbx_id: string;
  remote_ipbx_id: string | null;
  status: string;
  latency: number | null;
  channels: number | null;
  max_channels: number | null;
  provider: string | null;
}

interface NodePos { x: number; y: number; }

// ── Helpers ────────────────────────────────────────────────────────────────
const statusColor = (s: string) => {
  switch (s) {
    case "online": case "up":       return "#22c55e";
    case "offline": case "down":    return "#ef4444";
    case "degraded": case "warning": return "#f59e0b";
    default: return "#64748b";
  }
};

const statusGlow = (s: string) => {
  switch (s) {
    case "online": case "up":       return "0 0 16px 4px rgba(34,197,94,0.5)";
    case "offline": case "down":    return "0 0 16px 4px rgba(239,68,68,0.5)";
    case "degraded": case "warning": return "0 0 16px 4px rgba(245,158,11,0.5)";
    default: return "none";
  }
};

const trunkColor = (s: string, latency: number | null) => {
  if (s === "down") return "#ef4444";
  if (latency && latency > 100) return "#f59e0b";
  if (s === "up") return "#22c55e";
  return "#64748b";
};

// Auto-layout: place nodes in a circle
const autoLayout = (count: number, cx: number, cy: number, r: number): NodePos[] => {
  if (count === 0) return [];
  if (count === 1) return [{ x: cx, y: cy }];
  return Array.from({ length: count }, (_, i) => ({
    x: cx + r * Math.cos((2 * Math.PI * i) / count - Math.PI / 2),
    y: cy + r * Math.sin((2 * Math.PI * i) / count - Math.PI / 2),
  }));
};

// ── Tooltip ────────────────────────────────────────────────────────────────
const Tooltip = ({ x, y, children }: { x: number; y: number; children: React.ReactNode }) => (
  <foreignObject x={x + 12} y={y - 10} width={200} height={120} style={{ overflow: "visible" }}>
    <div style={{
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 11,
      color: "#e2e8f0",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      whiteSpace: "nowrap",
      width: "fit-content",
    }}>
      {children}
    </div>
  </foreignObject>
);

// ── Main Component ─────────────────────────────────────────────────────────
const NetworkMap = () => {
  const { applyFilter, allowedIpbxIds, isAdmin, ready } = useAllowedIpbx();
  const [ipbxList, setIpbxList] = useState<IPBX[]>([]);
  const [trunks, setTrunks] = useState<SipTrunk[]>([]);
  const [positions, setPositions] = useState<Record<string, NodePos>>({});
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredTrunk, setHoveredTrunk] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const svgRef = useRef<SVGSVGElement>(null);
  const WIDTH = 1200;
  const HEIGHT = 700;

  // ── Fetch data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    let ipbxQ: any = supabase.from("ipbx").select("id,name,ip_address,status,ping_latency,country_id");
    if (!isAdmin && allowedIpbxIds && allowedIpbxIds.length > 0)
      ipbxQ = ipbxQ.in("id", allowedIpbxIds);
    else if (!isAdmin && allowedIpbxIds !== null)
      ipbxQ = ipbxQ.in("id", ["00000000-0000-0000-0000-000000000000"]);

    const [ipbxRes, trunkRes] = await Promise.all([
      ipbxQ,
      applyFilter(supabase.from("sip_trunks").select("id,name,ipbx_id,remote_ipbx_id,status,latency,channels,max_channels,provider")),
    ]);

    const newIpbx: IPBX[] = ipbxRes.data || [];
    setIpbxList(newIpbx);
    setTrunks(trunkRes.data || []);

    // Init positions only for new nodes
    setPositions(prev => {
      const next = { ...prev };
      const newNodes = newIpbx.filter(i => !next[i.id]);
      if (newNodes.length > 0) {
        const positions = autoLayout(newIpbx.length, WIDTH / 2, HEIGHT / 2, Math.min(220, 80 + newIpbx.length * 30));
        newIpbx.forEach((ipbx, i) => {
          if (!next[ipbx.id]) next[ipbx.id] = positions[i];
        });
      }
      return next;
    });

    setLastUpdate(new Date());
    setLoading(false);
  }, [isAdmin, allowedIpbxIds, applyFilter]);

  useEffect(() => { if (ready) fetchData(); }, [ready, fetchData]);
  useEffect(() => {
    if (!ready) return;
    const i = setInterval(fetchData, 30000);
    return () => clearInterval(i);
  }, [ready, fetchData]);

  // ── Auto-layout reset ─────────────────────────────────────────────────────
  const resetLayout = () => {
    const pos = autoLayout(ipbxList.length, WIDTH / 2, HEIGHT / 2, Math.min(220, 80 + ipbxList.length * 30));
    const next: Record<string, NodePos> = {};
    ipbxList.forEach((ipbx, i) => { next[ipbx.id] = pos[i]; });
    setPositions(next);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // ── Node drag ─────────────────────────────────────────────────────────────
  const onNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const svgPt = getSVGPoint(e);
    setDragging(id);
    setDragOffset({
      x: svgPt.x - (positions[id]?.x || 0),
      y: svgPt.y - (positions[id]?.y || 0),
    });
  };

  const getSVGPoint = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const svgPt = pt.matrixTransform(inv);
    return { x: (svgPt.x - pan.x) / zoom, y: (svgPt.y - pan.y) / zoom };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const svgPt = getSVGPoint(e);
      setPositions(prev => ({
        ...prev,
        [dragging]: { x: svgPt.x - dragOffset.x, y: svgPt.y - dragOffset.y },
      }));
    } else if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const onMouseUp = () => { setDragging(null); setIsPanning(false); };

  const onSvgMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === "rect") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total: ipbxList.length,
    online: ipbxList.filter(i => i.status === "online").length,
    offline: ipbxList.filter(i => i.status === "offline").length,
    trunksUp: trunks.filter(t => t.status === "up").length,
    trunksDown: trunks.filter(t => t.status === "down").length,
  };

  // ── Render trunks as SVG lines ────────────────────────────────────────────
  const renderTrunks = () => trunks.map(trunk => {
    const src = positions[trunk.ipbx_id];
    const dstId = trunk.remote_ipbx_id;
    const dst = dstId ? positions[dstId] : null;
    if (!src) return null;

    // External trunk (no remote IPBX) — draw a line going out
    if (!dst) {
      const angle = Object.keys(positions).indexOf(trunk.ipbx_id) * 45;
      const rad = angle * Math.PI / 180;
      const endX = src.x + Math.cos(rad) * 80;
      const endY = src.y + Math.sin(rad) * 80;
      const color = trunkColor(trunk.status, trunk.latency);
      const isHovered = hoveredTrunk === trunk.id;

      return (
        <g key={trunk.id} onMouseEnter={() => setHoveredTrunk(trunk.id)} onMouseLeave={() => setHoveredTrunk(null)}>
          <line x1={src.x} y1={src.y} x2={endX} y2={endY}
            stroke={color} strokeWidth={isHovered ? 3 : 2}
            strokeDasharray={trunk.status === "down" ? "6 4" : "none"}
            strokeOpacity={0.8} />
          <circle cx={endX} cy={endY} r={5} fill={color} opacity={0.7} />
          {/* Latency label */}
          {trunk.latency && (
            <text x={(src.x + endX) / 2} y={(src.y + endY) / 2 - 6}
              fill={color} fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono">
              {trunk.latency}ms
            </text>
          )}
          {isHovered && (
            <Tooltip x={(src.x + endX) / 2} y={(src.y + endY) / 2}>
              <div style={{ fontWeight: 700, marginBottom: 3, color }}>{trunk.name}</div>
              <div style={{ color: "#94a3b8" }}>Provider: {trunk.provider || "—"}</div>
              <div style={{ color: "#94a3b8" }}>Latence: {trunk.latency ? `${trunk.latency}ms` : "—"}</div>
              <div style={{ color: "#94a3b8" }}>Canaux: {trunk.channels ?? 0}/{trunk.max_channels ?? 30}</div>
            </Tooltip>
          )}
        </g>
      );
    }

    // Inter-IPBX trunk — curved line
    const color = trunkColor(trunk.status, trunk.latency);
    const isHovered = hoveredTrunk === trunk.id;
    const mx = (src.x + dst.x) / 2;
    const my = (src.y + dst.y) / 2 - 40;
    const path = `M ${src.x} ${src.y} Q ${mx} ${my} ${dst.x} ${dst.y}`;

    return (
      <g key={trunk.id} onMouseEnter={() => setHoveredTrunk(trunk.id)} onMouseLeave={() => setHoveredTrunk(null)}>
        {/* Glow effect */}
        {trunk.status === "up" && (
          <path d={path} fill="none" stroke={color} strokeWidth={6} strokeOpacity={0.15} />
        )}
        <path d={path} fill="none" stroke={color}
          strokeWidth={isHovered ? 3 : 2}
          strokeDasharray={trunk.status === "down" ? "8 5" : "none"}
          strokeOpacity={0.9} />
        {/* Animated packet dot */}
        {trunk.status === "up" && (
          <circle r={3} fill={color} opacity={0.9}>
            <animateMotion dur={`${2 + Math.random() * 2}s`} repeatCount="indefinite" path={path} />
          </circle>
        )}
        {/* Labels */}
        <text x={mx} y={my - 8} fill={color} fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono">
          {trunk.latency ? `${trunk.latency}ms` : trunk.name}
        </text>
        {trunk.channels !== null && trunk.channels > 0 && (
          <text x={mx} y={my + 4} fill="#94a3b8" fontSize={8} textAnchor="middle">
            {trunk.channels} ch
          </text>
        )}
        {isHovered && (
          <Tooltip x={mx} y={my}>
            <div style={{ fontWeight: 700, marginBottom: 3, color }}>{trunk.name}</div>
            <div style={{ color: "#94a3b8" }}>Statut: <span style={{ color }}>{trunk.status}</span></div>
            <div style={{ color: "#94a3b8" }}>Latence: {trunk.latency ? `${trunk.latency}ms` : "—"}</div>
            <div style={{ color: "#94a3b8" }}>Canaux: {trunk.channels ?? 0}/{trunk.max_channels ?? 30}</div>
          </Tooltip>
        )}
      </g>
    );
  });

  // ── Render IPBX nodes ─────────────────────────────────────────────────────
  const renderNodes = () => ipbxList.map(ipbx => {
    const pos = positions[ipbx.id];
    if (!pos) return null;
    const color = statusColor(ipbx.status);
    const isHovered = hoveredNode === ipbx.id;
    const isDragged = dragging === ipbx.id;
    const r = 32;

    return (
      <g key={ipbx.id}
        transform={`translate(${pos.x}, ${pos.y})`}
        onMouseDown={(e) => onNodeMouseDown(e, ipbx.id)}
        onMouseEnter={() => setHoveredNode(ipbx.id)}
        onMouseLeave={() => setHoveredNode(null)}
        style={{ cursor: isDragged ? "grabbing" : "grab" }}>

        {/* Outer glow ring */}
        <circle r={r + 8} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.2} />
        <circle r={r + 4} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.15} />

        {/* Pulse animation for online */}
        {ipbx.status === "online" && (
          <circle r={r + 12} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0}>
            <animate attributeName="r" from={r} to={r + 20} dur="2s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" from={0.5} to={0} dur="2s" repeatCount="indefinite" />
          </circle>
        )}

        {/* Main circle */}
        <circle r={r} fill="#0f172a" stroke={color} strokeWidth={isDragged || isHovered ? 3 : 2}
          style={{ filter: `drop-shadow(${statusGlow(ipbx.status)})` }} />

        {/* Server icon */}
        <text y={-4} textAnchor="middle" fontSize={16} fill={color}>⬡</text>
        <text y={8} textAnchor="middle" fontSize={7} fill={color} fontFamily="JetBrains Mono" fontWeight="700">
          IPBX
        </text>

        {/* Status dot */}
        <circle cx={r - 6} cy={-(r - 6)} r={5} fill={color}>
          {ipbx.status === "online" && (
            <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
          )}
        </circle>

        {/* Name label */}
        <text y={r + 16} textAnchor="middle" fontSize={11} fill="#e2e8f0"
          fontFamily="JetBrains Mono" fontWeight="600">
          {ipbx.name}
        </text>
        <text y={r + 28} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="JetBrains Mono">
          {ipbx.ip_address || "—"}
        </text>

        {/* Hover tooltip */}
        {isHovered && !isDragged && (
          <Tooltip x={r + 4} y={-r}>
            <div style={{ fontWeight: 700, marginBottom: 4, color }}>{ipbx.name}</div>
            <div style={{ color: "#94a3b8" }}>IP: <span style={{ color: "#e2e8f0" }}>{ipbx.ip_address}</span></div>
            <div style={{ color: "#94a3b8" }}>Statut: <span style={{ color }}>{ipbx.status}</span></div>
            {ipbx.ping_latency && <div style={{ color: "#94a3b8" }}>Ping: <span style={{ color: "#22c55e" }}>{ipbx.ping_latency}ms</span></div>}
            <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 9 }}>
              {trunks.filter(t => t.ipbx_id === ipbx.id).length} trunk(s)
            </div>
          </Tooltip>
        )}
      </g>
    );
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity size={20} className="text-primary" />
            Network Map
          </h1>
          <p className="text-sm text-muted-foreground">
            Topologie VoIP en temps réel — {lastUpdate.toLocaleTimeString("fr-FR")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats pills */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success text-xs font-mono font-semibold">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse inline-block" />
            {stats.online} online
          </div>
          {stats.offline > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-mono font-semibold">
              <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
              {stats.offline} offline
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-mono font-semibold">
            {stats.trunksUp}/{stats.trunksUp + stats.trunksDown} trunks UP
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, z + 0.2))}>
              <ZoomIn size={13} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}>
              <ZoomOut size={13} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetLayout} title="Reset layout">
              <RotateCcw size={13} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchData} disabled={loading}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {[
          { color: "#22c55e", label: "En ligne / UP" },
          { color: "#ef4444", label: "Hors ligne / DOWN" },
          { color: "#f59e0b", label: "Dégradé / Latence élevée" },
          { color: "#64748b", label: "Inconnu" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 inline-block rounded" style={{ background: color }} />
            {label}
          </div>
        ))}
        <span className="ml-2">• Glisser les nœuds • Molette pour zoomer • Cliquer-glisser pour panoramique</span>
      </div>

      {/* Map canvas */}
      <div className="noc-card border border-border overflow-hidden rounded-xl"
        style={{ background: "linear-gradient(135deg, hsl(220,20%,5%), hsl(220,18%,8%))", position: "relative" }}>

        {/* Grid background */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.15 }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {loading && ipbxList.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 500 }}>
            <div className="text-center space-y-3">
              <RefreshCw size={24} className="animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground text-sm">Chargement de la topologie...</p>
            </div>
          </div>
        ) : ipbxList.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 500 }}>
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">Aucun IPBX configuré</p>
              <p className="text-xs text-muted-foreground">Ajoutez des IPBX dans la section IPBX</p>
            </div>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height={560}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            style={{ cursor: isPanning ? "grabbing" : "default" }}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseDown={onSvgMouseDown}
            onWheel={onWheel}
          >
            <defs>
              {/* Radial gradient for nodes */}
              <radialGradient id="nodeGrad" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </radialGradient>
              {/* Arrow marker */}
              <marker id="arrow-green" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#22c55e" />
              </marker>
              <marker id="arrow-red" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Trunks (behind nodes) */}
              {renderTrunks()}
              {/* Nodes (on top) */}
              {renderNodes()}
            </g>
          </svg>
        )}

        {/* Zoom indicator */}
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          background: "rgba(15,23,42,0.8)",
          border: "1px solid #1e293b",
          borderRadius: 6, padding: "4px 10px",
          fontSize: 11, color: "#64748b", fontFamily: "JetBrains Mono",
        }}>
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
};

export default NetworkMap;
