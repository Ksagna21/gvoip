import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/noc/StatusBadge";
import { Button } from "@/components/ui/button";
import { Network, Clock, AlertTriangle, RefreshCw } from "lucide-react";
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
  const [trunks, setTrunks] = useState<SipTrunk[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sip_trunks")
      .select("*, ipbx:ipbx!sip_trunks_ipbx_id_fkey(name), remote_ipbx:ipbx!sip_trunks_remote_ipbx_id_fkey(name)")
      .order("name");
    if (data) setTrunks(data as unknown as SipTrunk[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Auto-refresh toutes les 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">SIP Trunks</h1>
          <p className="text-sm text-muted-foreground">Supervision des trunks SIP — synchronisation automatique</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <p className="text-muted-foreground text-sm text-center py-8">Chargement...</p>
        ) : trunks.length === 0 ? (
          <div className="noc-card p-8 text-center border border-border">
            <Network className="mx-auto text-muted-foreground mb-2" size={32} />
            <p className="text-muted-foreground">Aucun SIP Trunk synchronisé</p>
            <p className="text-xs text-muted-foreground mt-1">Les trunks apparaissent automatiquement via le bridge AMI</p>
          </div>
        ) : (
          trunks.map((trunk, i) => (
            <motion.div
              key={trunk.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`noc-card border p-5 ${
                trunk.status === "down" ? "border-destructive/40 noc-glow-destructive" :
                trunk.status === "degraded" ? "border-warning/40 noc-glow-warning" :
                "border-border"
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${
                    trunk.status === "up" ? "bg-success/10" :
                    trunk.status === "down" ? "bg-destructive/10" : "bg-warning/10"
                  }`}>
                    <Network size={22} className={
                      trunk.status === "up" ? "text-success" :
                      trunk.status === "down" ? "text-destructive" : "text-warning"
                    } />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-mono font-bold text-foreground">{trunk.name}</h3>
                      <StatusBadge status={trunk.status as any} />
                      {trunk.remote_ipbx?.name && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-mono">Inter-IPBX</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {trunk.provider || "—"} · {trunk.ipbx?.name || "—"}
                      {trunk.remote_ipbx?.name ? ` ↔ ${trunk.remote_ipbx.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {trunk.local_ip || "—"} → {trunk.remote_ip || "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Latence</p>
                    <p className={`text-lg font-mono font-bold ${
                      !trunk.latency ? "text-muted-foreground" :
                      trunk.latency > 50 ? "text-warning" : "text-success"
                    }`}>{trunk.latency ? `${trunk.latency}ms` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Uptime</p>
                    <p className={`text-lg font-mono font-bold ${
                      (trunk.uptime ?? 0) >= 99.9 ? "text-success" :
                      (trunk.uptime ?? 0) >= 99 ? "text-warning" : "text-destructive"
                    }`}>{trunk.uptime ?? 0}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Canaux</p>
                    <p className="text-lg font-mono font-bold text-foreground">
                      {trunk.channels ?? 0}<span className="text-muted-foreground text-sm">/{trunk.max_channels ?? 30}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Échecs</p>
                    <p className={`text-lg font-mono font-bold ${
                      (trunk.failed_attempts ?? 0) > 10 ? "text-destructive" :
                      (trunk.failed_attempts ?? 0) > 0 ? "text-warning" : "text-success"
                    }`}>{trunk.failed_attempts ?? 0}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Dernier check: {trunk.last_check ? new Date(trunk.last_check).toLocaleString() : "—"}
                </span>
                {(trunk.failed_attempts ?? 0) > 10 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle size={12} /> Vérification nécessaire
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
