import { useAllowedIpbx } from "@/hooks/useAllowedIpbx";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Monitor, Phone, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";

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
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const { applyFilter, ready }      = useAllowedIpbx();

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
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [ready]);

  const filtered = extensions.filter(e => {
    const q = search.toLowerCase();
    return !q
      || e.number.toLowerCase().includes(q)
      || (e.name || "").toLowerCase().includes(q)
      || (e.ipbx?.name || "").toLowerCase().includes(q)
      || (e.ip_address || "").includes(q)
      || (e.user_agent || "").toLowerCase().includes(q);
  });

  /* Compteurs résumé */
  const onlineCount = extensions.filter(e => e.status === "registered").length;
  const offlineCount = extensions.filter(e => e.status === "unregistered").length;
  const busyCount = extensions.filter(e => e.status === "busy").length;

  return (
    <div className="space-y-5 pb-8" style={{ fontFamily: "Manrope, sans-serif" }}>

      {/* ── En-tête ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Extensions</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-medium">
            Supervision des postes SIP · Synchronisation automatique
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
      {extensions.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground">
            <span className="w-2 h-2 rounded-full bg-success" /> {onlineCount} En ligne
          </span>
          {offlineCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs font-bold text-destructive">
              <span className="w-2 h-2 rounded-full bg-destructive" /> {offlineCount} Hors ligne
            </span>
          )}
          {busyCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning/10 border border-warning/20 text-xs font-bold text-warning">
              <span className="w-2 h-2 rounded-full bg-warning" /> {busyCount} Occupé
            </span>
          )}
          <span className="text-xs text-muted-foreground font-medium ml-1">
            {extensions.length} extension{extensions.length > 1 ? "s" : ""} au total
          </span>
        </div>
      )}

      {/* ── Barre de recherche ──────────────────────────────── */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Numéro, nom, IP, IPBX…"
          className="w-full h-9 pl-9 pr-4 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
        />
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Extension", "Utilisateur", "IPBX", "Statut", "Adresse IP", "User Agent", "Appels"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest ${i === 6 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  {[1,2,3,4,5].map(i => (
                    <tr key={i} className="border-b border-border/40">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${40 + j * 10}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ) : extensions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Phone className="mx-auto text-muted-foreground mb-2" size={24} />
                    <p className="text-sm font-semibold text-muted-foreground">Aucune extension synchronisée</p>
                    <p className="text-xs text-muted-foreground mt-1">Les extensions apparaissent automatiquement via le bridge AMI</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Aucun résultat pour « {search} »
                  </td>
                </tr>
              ) : (
                filtered.map((ext, i) => (
                  <motion.tr
                    key={ext.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-border/40 hover:bg-muted/30 dark:hover:bg-muted/20 transition-colors"
                  >
                    {/* Numéro */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Phone size={12} className="text-primary" />
                        </div>
                        <span className="font-mono font-black text-foreground">{ext.number}</span>
                      </div>
                    </td>
                    {/* Nom */}
                    <td className="px-4 py-3 font-semibold text-foreground">{ext.name || "—"}</td>
                    {/* IPBX */}
                    <td className="px-4 py-3 text-xs text-muted-foreground font-medium">{ext.ipbx?.name || "—"}</td>
                    {/* Statut */}
                    <td className="px-4 py-3">
                      <span
                        className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full"
                        style={{
                          background: ext.status === "registered"   ? "rgba(76,175,125,.15)"
                                    : ext.status === "unregistered" ? "rgba(224,92,92,.15)"
                                    : "rgba(245,166,35,.15)",
                          color: ext.status === "registered"   ? "hsl(var(--success))"
                               : ext.status === "unregistered" ? "hsl(var(--destructive))"
                               : "hsl(var(--warning))",
                        }}
                      >
                        {ext.status === "registered"   ? "Enregistré"
                         : ext.status === "unregistered" ? "Hors ligne"
                         : ext.status}
                      </span>
                    </td>
                    {/* IP */}
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{ext.ip_address || "—"}</td>
                    {/* User Agent */}
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                      <div className="flex items-center gap-1">
                        {ext.user_agent && <Monitor size={11} className="shrink-0" />}
                        <span className="truncate">{ext.user_agent || "—"}</span>
                      </div>
                    </td>
                    {/* Appels */}
                    <td className="px-4 py-3 text-right font-mono font-black text-foreground">
                      {ext.calls_today ?? 0}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer compteur */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20">
            <p className="text-[10px] font-semibold text-muted-foreground">
              {filtered.length} extension{filtered.length > 1 ? "s" : ""}
              {search ? ` sur ${extensions.length}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Extensions;
