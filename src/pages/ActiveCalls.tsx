import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/noc/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PhoneCall, Timer, RefreshCw, Phone, PhoneIncoming, PhoneOutgoing,
  PhoneMissed, Download, Search, Filter, Calendar, Clock, Mic,
  Network, Loader2, ChevronDown, ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Call {
  id: string;
  caller: string;
  caller_name: string | null;
  callee: string;
  callee_name: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration: number | null;
  codec: string | null;
  mos: number | null;
  jitter: number | null;
  trunk_name: string | null;
  ipbx_id: string;
  ipbx?: { name: string };
}

// CDR vient directement du FreePBX via /api/cdr
interface CDR {
  calldate: string;
  src: string;
  dst: string;
  src_name?: string;
  dst_name?: string;
  context: string;
  duration: number;
  billsec: number;
  disposition: string;
  channel: string;
  dstchannel: string;
  uniqueid: string;
  ipbx_name?: string;
  ipbx_ip?: string;
  ipbx_id?: string;
}

interface SipFlow {
  id: string;
  call_id: string;
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  method: string;
  sip_type: string;
  sip_code: string;
  payload: string;
  created_at: string;
}

interface IPBX { id: string; name: string; ip_address?: string; host?: string; ssh_user?: string; ssh_password?: string; }

const formatDuration = (started_at: string) => {
  const seconds = Math.floor((Date.now() - new Date(started_at).getTime()) / 1000);
  if (seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatSeconds = (seconds: number) => {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatDate = (date: string) => {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
};

const getMosColor = (mos: number | null) => {
  if (!mos) return "text-muted-foreground";
  if (mos >= 4) return "text-success";
  if (mos >= 3.5) return "text-warning";
  return "text-destructive";
};

const getJitterColor = (jitter: number | null) => {
  if (!jitter) return "text-muted-foreground";
  if (jitter > 15) return "text-destructive";
  if (jitter > 5) return "text-warning";
  return "text-success";
};

const getDispositionIcon = (d: string) => {
  switch (d?.toUpperCase()) {
    case "ANSWERED": return <PhoneIncoming size={13} className="text-success" />;
    case "NO ANSWER": return <PhoneMissed size={13} className="text-warning" />;
    case "BUSY": return <PhoneOutgoing size={13} className="text-destructive" />;
    default: return <Phone size={13} className="text-muted-foreground" />;
  }
};

const getDispositionColor = (d: string) => {
  switch (d?.toUpperCase()) {
    case "ANSWERED": return "text-success";
    case "NO ANSWER": return "text-warning";
    case "BUSY": return "text-destructive";
    default: return "text-muted-foreground";
  }
};

const getSipColor = (method: string) => {
  if (method.startsWith("2")) return "#22c55e";
  if (method.startsWith("1")) return "#94a3b8";
  if (method.startsWith("4") || method.startsWith("5")) return "#ef4444";
  if (method === "INVITE") return "#3b82f6";
  if (method === "BYE") return "#f97316";
  if (method === "ACK") return "#8b5cf6";
  if (method === "CANCEL") return "#ef4444";
  return "#94a3b8";
};

const SipLadderDiagram = ({ uniqueid, calldate }: { uniqueid: string; calldate: string }) => {
  const [flows, setFlows] = useState<SipFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SipFlow | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let { data } = await supabase.from("sip_flows").select("*").eq("call_id", uniqueid).order("created_at", { ascending: true });
      if (!data || data.length === 0) {
        const t = new Date(calldate);
        const from = new Date(t.getTime() - 5000).toISOString();
        const to = new Date(t.getTime() + 180000).toISOString();
        const res = await supabase.from("sip_flows").select("*").gte("created_at", from).lte("created_at", to).order("created_at", { ascending: true }).limit(100);
        data = res.data;
      }
      setFlows(data || []);
      setLoading(false);
    };
    load();
  }, [uniqueid, calldate]);

  if (loading) return <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs"><Loader2 size={14} className="animate-spin" /> Chargement trace SIP...</div>;
  if (!flows.length) return <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs"><Network size={14} /> Aucune trace SIP disponible pour cet appel</div>;

  const endpointMap = new Map<string, number>();
  flows.forEach(f => {
    if (!endpointMap.has(f.src_ip)) endpointMap.set(f.src_ip, endpointMap.size);
    if (!endpointMap.has(f.dst_ip)) endpointMap.set(f.dst_ip, endpointMap.size);
  });
  const endpoints = Array.from(endpointMap.keys());
  const COL_WIDTH = 180, ROW_HEIGHT = 38, HEADER_H = 56, LEFT_PAD = 52;
  const totalW = endpoints.length * COL_WIDTH + LEFT_PAD + 20;
  const totalH = flows.length * ROW_HEIGHT + HEADER_H + 20;
  const getX = (ip: string) => LEFT_PAD + (endpointMap.get(ip) ?? 0) * COL_WIDTH + COL_WIDTH / 2;
  const getY = (i: number) => HEADER_H + i * ROW_HEIGHT + ROW_HEIGHT / 2;
  const t0 = flows[0] ? new Date(flows[0].created_at).getTime() : 0;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-[#0a0f1a]">
        <svg width={Math.max(totalW, 400)} height={totalH} style={{ fontFamily: "'JetBrains Mono', monospace", display: "block" }}>
          {endpoints.map((ep) => {
            const x = getX(ep);
            return (
              <g key={ep}>
                <rect x={x - 72} y={6} width={144} height={38} rx={5} fill="#111827" stroke="#1e293b" strokeWidth={1} />
                <text x={x} y={21} textAnchor="middle" fill="#64748b" fontSize={8} fontWeight="600">ENDPOINT</text>
                <text x={x} y={35} textAnchor="middle" fill="#94a3b8" fontSize={10} fontWeight="700">{ep}</text>
                <line x1={x} y1={HEADER_H} x2={x} y2={totalH - 10} stroke="#1e293b" strokeWidth={1} strokeDasharray="3,4" />
              </g>
            );
          })}
          {flows.map((flow, i) => {
            const x1 = getX(flow.src_ip), x2 = getX(flow.dst_ip), y = getY(i);
            const color = getSipColor(flow.method);
            const goRight = x2 >= x1, isSelf = x1 === x2, midX = (x1 + x2) / 2;
            const ts = ((new Date(flow.created_at).getTime() - t0) / 1000).toFixed(3);
            const isSelected = selected?.id === flow.id;
            return (
              <g key={flow.id} onClick={() => setSelected(isSelected ? null : flow)} style={{ cursor: "pointer" }}>
                <rect x={0} y={y - 17} width={Math.max(totalW, 400)} height={34} fill={isSelected ? "rgba(59,130,246,0.08)" : "transparent"} className="hover:fill-white/[0.03] transition-all" />
                <text x={LEFT_PAD - 6} y={y + 4} textAnchor="end" fill="#334155" fontSize={8}>{ts}s</text>
                {isSelf ? (
                  <path d={`M ${x1} ${y - 8} Q ${x1 + 30} ${y - 8} ${x1 + 30} ${y} Q ${x1 + 30} ${y + 8} ${x1} ${y + 8}`} fill="none" stroke={color} strokeWidth={1.5} />
                ) : (
                  <>
                    <line x1={goRight ? x1 + 5 : x1 - 5} y1={y} x2={goRight ? x2 - 8 : x2 + 8} y2={y} stroke={color} strokeWidth={1.5} strokeOpacity={isSelected ? 1 : 0.85} />
                    <polygon points={goRight ? `${x2 - 2},${y - 5} ${x2 + 4},${y} ${x2 - 2},${y + 5}` : `${x2 + 2},${y - 5} ${x2 - 4},${y} ${x2 + 2},${y + 5}`} fill={color} />
                  </>
                )}
                {!isSelf && (
                  <>
                    <rect x={midX - 42} y={y - 14} width={84} height={15} rx={3} fill="#0a0f1a" />
                    <text x={midX} y={y - 2} textAnchor="middle" fill={color} fontSize={10} fontWeight="700" letterSpacing="0.5">{flow.method}</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-lg border border-border bg-[#0a0f1a] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <span style={{ color: getSipColor(selected.method) }} className="text-xs font-bold font-mono">{selected.method}</span>
                <span className="text-xs text-muted-foreground font-mono">{selected.src_ip}:{selected.src_port} → {selected.dst_ip}:{selected.dst_port}</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{((new Date(selected.created_at).getTime() - t0) / 1000).toFixed(3)}s</span>
            </div>
            <pre className="text-xs text-muted-foreground p-3 overflow-x-auto whitespace-pre-wrap max-h-52 overflow-y-auto font-mono leading-relaxed">{selected.payload || "— payload non disponible —"}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Modal détail CDR ───────────────────────────────────────────────────────────
const CDRDetail = ({ cdr, onClose }: { cdr: CDR | null; onClose: () => void }) => {
  const [showSip, setShowSip] = useState(false);
  useEffect(() => { setShowSip(false); }, [cdr?.uniqueid]);
  return (
    <Dialog open={!!cdr} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cdr && getDispositionIcon(cdr.disposition)}
            Détail de l'appel
          </DialogTitle>
        </DialogHeader>
        {cdr && (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Appelant</p>
                <p className="font-semibold text-foreground">{cdr.src}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Destinataire</p>
                <p className="font-semibold text-foreground">{cdr.dst}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar size={10} /> Date</p>
                <p className="text-sm font-mono text-foreground">{formatDate(cdr.calldate)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Clock size={10} /> Durée</p>
                <p className="text-sm font-mono font-bold text-foreground">{formatSeconds(cdr.billsec || cdr.duration)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground mb-1">Statut</p>
                <div className={`flex items-center justify-center gap-1 font-bold text-xs ${getDispositionColor(cdr.disposition)}`}>
                  {getDispositionIcon(cdr.disposition)} {cdr.disposition}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground mb-1">Contexte</p>
                <p className="text-xs font-mono text-foreground">{cdr.context || "—"}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground mb-1">IPBX</p>
                <p className="text-xs font-mono text-foreground">{cdr.ipbx_name || "—"}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/20">
              <p className="text-xs text-muted-foreground mb-1">Channel</p>
              <p className="text-xs font-mono text-muted-foreground break-all">{cdr.channel || "—"}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/20">
              <p className="text-xs text-muted-foreground mb-1">ID Unique</p>
              <p className="text-xs font-mono text-muted-foreground break-all">{cdr.uniqueid}</p>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <button onClick={() => setShowSip(v => !v)} className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-sm font-semibold text-foreground">
                <div className="flex items-center gap-2"><Network size={14} className="text-primary" />Trace SIP</div>
                {showSip ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </button>
              <AnimatePresence>
                {showSip && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-3"><SipLadderDiagram uniqueid={cdr.uniqueid} calldate={cdr.calldate} /></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Composant principal ────────────────────────────────────────────────────────
const ActiveCalls = () => {
  const [tab, setTab] = useState<"active" | "history">("active");

  // Appels actifs (depuis Supabase — inchangé)
  const [calls, setCalls] = useState<Call[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [tick, setTick] = useState(0);

  // CDR — depuis FreePBX directement via /api/cdr
  const [cdrs, setCdrs] = useState<CDR[]>([]);
  const [loadingCdr, setLoadingCdr] = useState(false);
  const [selectedCdr, setSelectedCdr] = useState<CDR | null>(null);
  const [ipbxList, setIpbxList] = useState<IPBX[]>([]);

  // Filtres CDR
  const [period, setPeriod] = useState("today");
  const [ipbxFilter, setIpbxFilter] = useState("all");
  const [dispositionFilter, setDispositionFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cdrStats, setCdrStats] = useState({ total: 0, answered: 0, missed: 0, totalDuration: 0, avgDuration: 0 });

  const { applyFilter, allowedIpbxIds, isAdmin: isAdminUser } = useAllowedIpbx();

  // ── Appels actifs depuis Supabase ─────────────────────────────────────────
  // useCallback garantit que fetchCalls se re-crée uniquement quand applyFilter
  // change (= quand allowedIpbxIds / isAdminUser sont résolus).
  const fetchCalls = useCallback(async () => {
    const { data, error } = await applyFilter(
      supabase.from("calls").select("*, ipbx(name)").eq("status", "active")
    ).order("started_at", { ascending: false });
    if (!error && data) setCalls(data as Call[]);
    setLoadingCalls(false);
    setLastUpdate(new Date());
  }, [applyFilter]);

  // Lance le fetch dès que fetchCalls change (= dès que les droits sont résolus)
  useEffect(() => {
    fetchCalls();
    const interval = setInterval(fetchCalls, 10000);
    return () => clearInterval(interval);
  }, [fetchCalls]);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ref pour eviter la closure perimee dans l'abonnement realtime
  const fetchCallsRef = useRef(fetchCalls);
  useEffect(() => { fetchCallsRef.current = fetchCalls; }, [fetchCalls]);

  useEffect(() => {
    const channel = supabase.channel("calls-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => fetchCallsRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Charger IPBX depuis Supabase (filtrés selon droits user) ──────────────
  useEffect(() => {
    let q: any = supabase.from("ipbx").select("id,name,ip_address,host,ssh_user,ssh_password");
    if (!isAdminUser && allowedIpbxIds && allowedIpbxIds.length > 0)
      q = q.in("id", allowedIpbxIds);
    else if (!isAdminUser && allowedIpbxIds !== null)
      q = q.in("id", ["00000000-0000-0000-0000-000000000000"]);
    q.then(({ data }: any) => { if (data) setIpbxList(data as IPBX[]); });
  }, [isAdminUser, allowedIpbxIds]);

  // ── CDR : calcul plage de dates ───────────────────────────────────────────
  const getDateRangeForApi = (): { date_from: string; date_to: string } => {
    const now      = new Date();
    const today    = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
    switch (period) {
      case "today":     return { date_from: today,     date_to: today };
      case "yesterday": return { date_from: yesterday, date_to: yesterday };
      case "custom":    return { date_from: dateFrom || today, date_to: dateTo || dateFrom || today };
      default:          return { date_from: today, date_to: today };
    }
  };

  // ── CDR : fetch direct depuis FreePBX via SSH + MySQL ────────────────────
  const fetchCDRs = async () => {
    setLoadingCdr(true);
    const { date_from, date_to } = getDateRangeForApi();
    const targets = ipbxFilter === "all"
      ? ipbxList
      : ipbxList.filter(i => i.id === ipbxFilter);

    const allCdrs: CDR[] = [];

    for (const ipbx of targets) {
      const ip = ipbx.ip_address || ipbx.host || "";
      if (!ip) continue;
      const params = new URLSearchParams({
        ip,
        ssh_user:     ipbx.ssh_user || "root",
        ssh_password: ipbx.ssh_password || "",
        date_from,
        date_to,
        limit:        "500",
      });
      try {
        const res = await fetch(`/api/cdr?${params}`);
        if (res.ok) {
          const data = await res.json();
          allCdrs.push(...(data.calls || []).map((c: CDR) => ({
            ...c, ipbx_name: ipbx.name, ipbx_ip: ip, ipbx_id: ipbx.id,
          })));
        }
      } catch {}
    }

    // Trier par date décroissante
    allCdrs.sort((a, b) => new Date(b.calldate).getTime() - new Date(a.calldate).getTime());

    // Normaliser disposition (FreePBX peut renvoyer "NO ANSWER" ou "NO_ANSWER")
    allCdrs.forEach(c => {
      if (c.disposition) c.disposition = c.disposition.trim().replace("NO_ANSWER", "NO ANSWER");
    });

    // Stats calculées sur TOUS les appels (avant filtre disposition/recherche)
    const answered     = allCdrs.filter(c => c.disposition === "ANSWERED").length;
    const missed       = allCdrs.filter(c => c.disposition === "NO ANSWER").length;
    const totalDuration = allCdrs.reduce((a, c) => a + (c.billsec || 0), 0);
    setCdrStats({
      total: allCdrs.length, answered, missed, totalDuration,
      avgDuration: answered > 0 ? Math.round(totalDuration / answered) : 0,
    });

    // Appliquer filtres locaux (affichage seulement)
    let filtered = allCdrs;
    if (dispositionFilter !== "all") filtered = filtered.filter(c => c.disposition === dispositionFilter);
    if (searchText) filtered = filtered.filter(c =>
      c.src?.includes(searchText) || c.dst?.includes(searchText) ||
      c.ipbx_name?.toLowerCase().includes(searchText.toLowerCase())
    );

    setCdrs(filtered);

    setLoadingCdr(false);
  };

  useEffect(() => { if (tab === "history" && ipbxList.length > 0) fetchCDRs(); }, [tab, ipbxList, period, ipbxFilter]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!cdrs.length) return;
    const headers = ["Date", "Appelant", "Destinataire", "Durée (s)", "Billsec", "Disposition", "Channel", "IPBX"];
    const rows = cdrs.map(c => [formatDate(c.calldate), c.src, c.dst, c.duration || 0, c.billsec || 0, c.disposition, c.channel || "", c.ipbx_name || ""]);
    const csv = [headers, ...rows].map(r => r.map((v: any) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `CDR_${period}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDownloadPcap = async (cdr: CDR, e: React.MouseEvent) => {
    e.stopPropagation();
    const ipbx = ipbxList.find(i => i.id === cdr.ipbx_id);
    if (!ipbx) return;
    const ip = ipbx.ip_address || ipbx.host || "";
    const params = new URLSearchParams({
      ip, ssh_user: ipbx.ssh_user || "root",
      ssh_password: ipbx.ssh_password || "",
      uniqueid: cdr.uniqueid,
    });
    try {
      const res = await fetch(`/api/pcap?${params}`);
      const data = await res.json();
      if (!res.ok) { alert(data.error + (data.hint ? `\n${data.hint}` : "")); return; }
      const bytes = Uint8Array.from(atob(data.pcap_b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/vnd.tcpdump.pcap" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = data.filename; a.click(); URL.revokeObjectURL(url);
    } catch { alert("Erreur lors du téléchargement PCAP"); }
  };

  const avgMos = calls.filter(c => c.mos).length > 0 ? calls.filter(c => c.mos).reduce((a, c) => a + (c.mos || 0), 0) / calls.filter(c => c.mos).length : null;
  const avgJitter = calls.filter(c => c.jitter).length > 0 ? calls.filter(c => c.jitter).reduce((a, c) => a + (c.jitter || 0), 0) / calls.filter(c => c.jitter).length : null;

  return (
    <div className="space-y-6">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Appels</h1>
          <p className="text-sm text-muted-foreground">Supervision et historique des communications</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "active" && (
            <>
              <button onClick={fetchCalls} className="p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                <RefreshCw size={14} className="text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10 text-success font-mono text-sm font-semibold">
                <PhoneCall size={16} className="animate-pulse" />
                {calls.length} actif{calls.length > 1 ? "s" : ""}
              </div>
            </>
          )}
          {tab === "history" && (
            <Button onClick={handleExport} variant="outline" size="sm">
              <Download size={14} className="mr-1" /> Exporter CSV
            </Button>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-fit">
        <button onClick={() => setTab("active")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <PhoneCall size={14} className="inline mr-1.5" />Appels actifs
        </button>
        <button onClick={() => setTab("history")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Clock size={14} className="inline mr-1.5" />Historique CDR
        </button>
      </div>

      {/* ── ONGLET APPELS ACTIFS (inchangé) ─────────────────────────────── */}
      {tab === "active" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="noc-card p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground uppercase mb-1">Total actifs</p>
              <p className="text-2xl font-bold text-foreground">{calls.length}</p>
            </div>
            <div className="noc-card p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground uppercase mb-1">MOS moyen</p>
              <p className={`text-2xl font-bold ${getMosColor(avgMos)}`}>{avgMos ? avgMos.toFixed(1) : "—"}</p>
            </div>
            <div className="noc-card p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground uppercase mb-1">Jitter moyen</p>
              <p className={`text-2xl font-bold ${getJitterColor(avgJitter)}`}>{avgJitter ? `${avgJitter.toFixed(0)}ms` : "—"}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Mise à jour : {lastUpdate.toLocaleTimeString()}</p>
          <div className="grid gap-3">
            {loadingCalls && calls.length === 0 ? (
              // Skeleton non-bloquant : montre la structure immédiatement
              [1, 2, 3].map(k => (
                <div key={k} className="noc-card border border-border p-4 animate-pulse">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-5 w-16 rounded bg-muted/40" />
                      <div className="h-4 w-32 rounded bg-muted/40" />
                    </div>
                    <div className="flex gap-5">
                      {[1,2,3,4].map(j => <div key={j} className="h-8 w-14 rounded bg-muted/40" />)}
                    </div>
                  </div>
                </div>
              ))
            ) : calls.length === 0 ? (
              <div className="noc-card p-12 text-center border border-border">
                <Phone className="mx-auto text-muted-foreground mb-3" size={40} />
                <p className="text-foreground font-semibold">Aucun appel actif</p>
                <p className="text-muted-foreground text-sm mt-1">Les appels apparaissent ici en temps réel</p>
              </div>
            ) : (
              <AnimatePresence>
                {calls.map((call, i) => (
                  <motion.div key={call.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: i * 0.04 }} onClick={() => setSelectedCall(call)} className="noc-card border border-border p-4 cursor-pointer hover:border-primary/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <StatusBadge status={call.status} />
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">{call.caller_name || call.caller}</p>
                            <p className="text-xs font-mono text-muted-foreground">{call.caller}</p>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <PhoneOutgoing size={10} className="text-primary" />
                            <div className="text-primary font-mono text-lg">→</div>
                            <PhoneIncoming size={10} className="text-success" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{call.callee_name || call.callee}</p>
                            <p className="text-xs font-mono text-muted-foreground">{call.callee}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-5 text-xs flex-wrap">
                        <div className="text-center"><p className="text-muted-foreground uppercase mb-0.5">Durée</p><p className="font-mono font-bold text-foreground flex items-center gap-1"><Timer size={11} />{formatDuration(call.started_at)}</p></div>
                        <div className="text-center"><p className="text-muted-foreground uppercase mb-0.5">Codec</p><p className="font-mono font-bold text-foreground">{call.codec || "—"}</p></div>
                        <div className="text-center"><p className="text-muted-foreground uppercase mb-0.5">MOS</p><p className={`font-mono font-bold ${getMosColor(call.mos)}`}>{call.mos ? call.mos.toFixed(1) : "—"}</p></div>
                        <div className="text-center"><p className="text-muted-foreground uppercase mb-0.5">Jitter</p><p className={`font-mono font-bold ${getJitterColor(call.jitter)}`}>{call.jitter ? `${call.jitter}ms` : "—"}</p></div>
                        <div className="text-center"><p className="text-muted-foreground uppercase mb-0.5">IPBX</p><p className="font-mono text-xs text-muted-foreground">{call.ipbx?.name || "—"}</p></div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      )}

      {/* ── ONGLET HISTORIQUE CDR — depuis FreePBX MySQL ─────────────────── */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* Filtres */}
          <div className="noc-card p-4 border border-border space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter size={13} className="text-primary" /> Filtres
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Période</Label>
                <Select value={period} onValueChange={(v) => setPeriod(v)}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Aujourd'hui</SelectItem>
                    <SelectItem value="yesterday">Hier</SelectItem>
                    <SelectItem value="custom">Date personnalisée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">IPBX</Label>
                <Select value={ipbxFilter} onValueChange={(v) => setIpbxFilter(v)}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les IPBX</SelectItem>
                    {ipbxList.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Statut</Label>
                <Select value={dispositionFilter} onValueChange={(v) => setDispositionFilter(v)}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="ANSWERED">Répondus</SelectItem>
                    <SelectItem value="NO ANSWER">Manqués</SelectItem>
                    <SelectItem value="BUSY">Occupé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Recherche</Label>
                <div className="relative mt-1">
                  <Search size={11} className="absolute left-2 top-2 text-muted-foreground" />
                  <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Numéro ou IPBX..." className="h-8 text-xs pl-6" />
                </div>
              </div>
            </div>
            {period === "custom" && (
              <div className="flex items-end gap-3">
                <div>
                  <Label className="text-xs">Du</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 h-8 text-xs w-40" />
                </div>
                <div>
                  <Label className="text-xs">Au</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 h-8 text-xs w-40" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={() => fetchCDRs()} size="sm">
                <Search size={13} className="mr-1" /> Rechercher
              </Button>
              <span className="text-xs text-muted-foreground italic">
                Source : CDR MySQL FreePBX — aucun stockage en base
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total",        value: cdrStats.total,                       color: "text-foreground" },
              { label: "Répondus",     value: cdrStats.answered,                    color: "text-success" },
              { label: "Manqués",      value: cdrStats.missed,                      color: "text-warning" },
              { label: "Durée totale", value: formatSeconds(cdrStats.totalDuration), color: "text-primary" },
              { label: "Durée moy.",   value: formatSeconds(cdrStats.avgDuration),  color: "text-primary" },
            ].map((s) => (
              <div key={s.label} className="noc-card p-3 border border-border text-center">
                <p className="text-xs text-muted-foreground uppercase mb-1">{s.label}</p>
                <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Tableau CDR */}
          <div className="noc-card border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 text-muted-foreground font-semibold">Date</th>
                    <th className="text-left p-3 text-muted-foreground font-semibold">Appelant</th>
                    <th className="text-left p-3 text-muted-foreground font-semibold">Destinataire</th>
                    <th className="text-left p-3 text-muted-foreground font-semibold">Durée</th>
                    <th className="text-left p-3 text-muted-foreground font-semibold">Statut</th>
                    <th className="text-left p-3 text-muted-foreground font-semibold">IPBX</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCdr ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <Loader2 size={16} className="animate-spin inline mr-2" />Lecture CDR depuis FreePBX...
                    </td></tr>
                  ) : cdrs.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Aucun enregistrement pour cette date</td></tr>
                  ) : (
                    cdrs.map((cdr, i) => (
                      <motion.tr key={cdr.uniqueid || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.005 }}
                        onClick={() => setSelectedCdr(cdr)}
                        className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors">
                        <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">{formatDate(cdr.calldate)}</td>
                        <td className="p-3">
                          <p className="font-mono font-semibold text-foreground">{cdr.src}</p>
                          {cdr.src_name && <p className="text-muted-foreground text-[11px]">{cdr.src_name}</p>}
                        </td>
                        <td className="p-3">
                          <p className="font-mono text-foreground">{cdr.dst}</p>
                          {cdr.dst_name && <p className="text-muted-foreground text-[11px]">{cdr.dst_name}</p>}
                        </td>
                        <td className="p-3 font-mono font-bold text-foreground">{formatSeconds(cdr.billsec || cdr.duration)}</td>
                        <td className="p-3">
                          <div className={`flex items-center gap-1 font-semibold ${getDispositionColor(cdr.disposition)}`}>
                            {getDispositionIcon(cdr.disposition)} {cdr.disposition || "—"}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{cdr.ipbx_name || "—"}</td>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleDownloadPcap(cdr, e)}
                            title="Télécharger PCAP"
                            className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-primary transition-colors">
                            <Mic size={13} />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal appel actif */}
      <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><PhoneCall size={16} className="text-success animate-pulse" />Appel en cours</DialogTitle></DialogHeader>
          {selectedCall && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/20"><p className="text-xs text-muted-foreground mb-1">Appelant</p><p className="font-semibold text-foreground">{selectedCall.caller_name || selectedCall.caller}</p><p className="text-xs font-mono text-muted-foreground">{selectedCall.caller}</p></div>
                <div className="p-3 rounded-lg bg-muted/20"><p className="text-xs text-muted-foreground mb-1">Destinataire</p><p className="font-semibold text-foreground">{selectedCall.callee_name || selectedCall.callee}</p><p className="text-xs font-mono text-muted-foreground">{selectedCall.callee}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/20"><p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar size={10} /> Début</p><p className="text-sm font-mono text-foreground">{formatDate(selectedCall.started_at)}</p></div>
                <div className="p-3 rounded-lg bg-muted/20"><p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Timer size={10} /> Durée</p><p className="text-sm font-mono font-bold text-success">{formatDuration(selectedCall.started_at)}</p></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted/20 text-center"><p className="text-xs text-muted-foreground mb-1">Codec</p><p className="font-mono font-bold text-foreground">{selectedCall.codec || "—"}</p></div>
                <div className="p-3 rounded-lg bg-muted/20 text-center"><p className="text-xs text-muted-foreground mb-1">MOS</p><p className={`font-mono font-bold ${getMosColor(selectedCall.mos)}`}>{selectedCall.mos ? selectedCall.mos.toFixed(1) : "—"}</p></div>
                <div className="p-3 rounded-lg bg-muted/20 text-center"><p className="text-xs text-muted-foreground mb-1">Jitter</p><p className={`font-mono font-bold ${getJitterColor(selectedCall.jitter)}`}>{selectedCall.jitter ? `${selectedCall.jitter}ms` : "—"}</p></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal détail CDR */}
      <CDRDetail cdr={selectedCdr} onClose={() => setSelectedCdr(null)} />
    </div>
  );
};

export default ActiveCalls;
