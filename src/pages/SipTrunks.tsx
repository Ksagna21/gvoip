import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { StatusBadge } from "@/components/noc/StatusBadge";
import { Network, Clock, AlertTriangle, RefreshCw, Search } from "lucide-react";
import { motion } from "framer-motion";

interface SipTrunk {
  id: string;
  ipbx_id: string;
  remote_ipbx_id: string | null;
  name: string;
  status: string;
  provider: string | null;
  ip_address: string | null;
  local_ip: string | null;
  remote_ip: string | null;
  channels: number | null;
  max_channels: number | null;
  latency: number | null;
  uptime: number | null;
  failed_attempts: number | null;
  last_check: string | null;
  ipbx?: { name: string };
  remote_ipbx?: { name: string };
}

const SipTrunks = () => {
  const [trunks, setTrunks]   = useState<SipTrunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const { applyFilter, ready } = useAllowedIpbx();

  const fetchData = async () => {
    setLoading(true);
    const { data } = await applyFilter(
      supabase.from("sip_trunks").select(
        "*, ipbx:ipbx!sip_trunks_ipbx_id_fkey(name), remote_ipbx:ipbx!sip_trunks_remote_ipbx_id_fkey(name)"
      )
    ).order("name");
    if (data) setTrunks(data as unknown as SipTrunk[]);
    setLoading(false);
  };

  useEffect(() => { if (ready) fetchData(); }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [ready]);

  const filtered = trunks.filter(t => {
    const q = search.toLowerCase();
    return !q
      || t.name.toLowerCase().includes(q)
      || (t.provider || "").toLowerCase().includes(q)
      || (t.ipbx?.name || "").toLowerCase().includes(q)
      || (t.local_ip || "").includes(q)
      || (t.remote_ip || "").includes(q);
  });

  /* Compteurs résumé */
  const upCount   = trunks.filter(t => t.status === "up").length;
  const downCount = trunks.filter(t => t.status === "down").length;
  const degCount  = trunks.filter(t => t.status === "degraded").length;

  return (
    <div className="space-y-5 pb-8" style={{ fontFamily: "'Raleway', sans-serif" }}>

      {/* ── En-tête ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">SIP Trunks</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-medium">
            Supervision en temps réel · Synchronisation automatique
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-foreground text-xs font-bold hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {/* ── Stats rapides ───────────────────────────────────── */}
      {trunks.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground">
            <span className="w-2 h-2 rounded-full bg-success" /> {upCount} UP
          </span>
          {downCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs font-bold text-destructive">
              <span className="w-2 h-2 rounded-full bg-destructive" /> {downCount} DOWN
            </span>
          )}
          {degCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning/10 border border-warning/20 text-xs font-bold text-warning">
              <span className="w-2 h-2 rounded-full bg-warning" /> {degCount} DÉGRADÉ
            </span>
          )}
          <span className="text-xs text-muted-foreground font-medium ml-1">{trunks.length} trunk{trunks.length > 1 ? "s" : ""} au total</span>
        </div>
      )}

      {/* ── Barre de recherche ──────────────────────────────── */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Nom, IP, fournisseur, IPBX…"
          className="w-full h-9 pl-9 pr-4 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
        />
      </div>

      {/* ── Liste ───────────────────────────────────────────── */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-40 bg-muted rounded" />
                    <div className="h-2.5 w-24 bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : trunks.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <Network className="mx-auto text-muted-foreground mb-3" size={28} />
            <p className="text-sm font-semibold text-muted-foreground">Aucun SIP Trunk synchronisé</p>
            <p className="text-xs text-muted-foreground mt-1">Les trunks apparaissent automatiquement via le bridge AMI</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <Network className="mx-auto text-muted-foreground mb-3" size={28} />
            <p className="text-sm font-semibold text-muted-foreground">Aucun résultat pour « {search} »</p>
          </div>
        ) : (
          filtered.map((trunk, i) => (
            <motion.div
              key={trunk.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`bg-card border rounded-2xl p-5 transition-all duration-200 ${
                trunk.status === "down"     ? "border-destructive/40" :
                trunk.status === "degraded" ? "border-warning/40"     :
                "border-border hover:border-primary/30"
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                {/* Infos principales */}
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    trunk.status === "up"       ? "bg-success/10"     :
                    trunk.status === "down"     ? "bg-destructive/10" :
                    "bg-warning/10"
                  }`}>
                    <Network size={20} className={
                      trunk.status === "up"       ? "text-success"     :
                      trunk.status === "down"     ? "text-destructive" :
                      "text-warning"
                    } />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-mono font-black text-foreground">{trunk.name}</h3>
                      <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full" style={{
                        background: trunk.status === "up" ? "rgba(76,175,125,.15)" : trunk.status === "down" ? "rgba(224,92,92,.15)" : "rgba(245,166,35,.15)",
                        color: trunk.status === "up" ? "hsl(var(--success))" : trunk.status === "down" ? "hsl(var(--destructive))" : "hsl(var(--warning))",
                      }}>
                        {trunk.status}
                      </span>
                      {trunk.remote_ipbx?.name && (
                        <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary">
                          Inter-IPBX
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {trunk.provider || "—"} · {trunk.ipbx?.name || "—"}
                      {trunk.remote_ipbx?.name ? ` ↔ ${trunk.remote_ipbx.name}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {trunk.local_ip || "—"} → {trunk.remote_ip || "—"}
                    </p>
                  </div>
                </div>

                {/* Métriques */}
                <div className="grid grid-cols-4 gap-4 text-center shrink-0">
                  {[
                    {
                      label: "Latence",
                      value: trunk.latency ? `${trunk.latency}ms` : "—",
                      color: !trunk.latency ? "text-muted-foreground" : trunk.latency > 50 ? "text-warning" : "text-success",
                    },
                    {
                      label: "Uptime",
                      value: `${trunk.uptime ?? 0}%`,
                      color: (trunk.uptime ?? 0) >= 99.9 ? "text-success" : (trunk.uptime ?? 0) >= 99 ? "text-warning" : "text-destructive",
                    },
                    {
                      label: "Canaux",
                      value: `${trunk.channels ?? 0}/${trunk.max_channels ?? 30}`,
                      color: "text-foreground",
                    },
                    {
                      label: "Échecs",
                      value: String(trunk.failed_attempts ?? 0),
                      color: (trunk.failed_attempts ?? 0) > 10 ? "text-destructive" : (trunk.failed_attempts ?? 0) > 0 ? "text-warning" : "text-success",
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-muted/40 dark:bg-muted/20 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">{label}</p>
                      <p className={`text-sm font-black font-mono ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <Clock size={11} />
                  {trunk.last_check ? new Date(trunk.last_check).toLocaleString("fr-FR") : "—"}
                </span>
                {(trunk.failed_attempts ?? 0) > 10 && (
                  <span className="flex items-center gap-1 text-destructive font-bold">
                    <AlertTriangle size={11} /> Vérification nécessaire
                  </span>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default SipTrunks;
