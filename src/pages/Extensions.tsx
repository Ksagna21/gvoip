import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { StatusBadge } from "@/components/noc/StatusBadge";
import { Button } from "@/components/ui/button";
import { Phone, Monitor, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

interface Extension {
  id: string;
  ipbx_id: string;
  number: string;
  name: string;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  last_registration: string | null;
  calls_today: number | null;
  ipbx?: { name: string };
}

const Extensions = () => {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const { applyFilter, ready } = useAllowedIpbx();

  const fetchData = async () => {
    setLoading(true);
    const { data } = await applyFilter(
      supabase.from("extensions").select("*, ipbx(name)")
    ).order("number");
    if (data) setExtensions(data as Extension[]);
    setLoading(false);
  };

  useEffect(() => { if (ready) fetchData(); }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [ready]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Extensions</h1>
          <p className="text-sm text-muted-foreground">Supervision des postes SIP — synchronisation automatique</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      <div className="noc-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Extension</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">IPBX</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">IP</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User Agent</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appels</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>
              ) : extensions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Aucune extension synchronisée
                    <p className="text-xs mt-1">Les extensions apparaissent automatiquement via le bridge AMI</p>
                  </td>
                </tr>
              ) : (
                extensions.map((ext, i) => (
                  <motion.tr
                    key={ext.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-primary" />
                        <span className="font-mono font-bold text-foreground">{ext.number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{ext.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{ext.ipbx?.name || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={ext.status as any} /></td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{ext.ip_address || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs flex items-center gap-1">
                      {ext.user_agent && <Monitor size={12} />}{ext.user_agent || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">{ext.calls_today ?? 0}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Extensions;
