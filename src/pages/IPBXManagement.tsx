import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/noc/StatusBadge";
import { Server, Plus, Pencil, Trash2, Wifi, WifiOff, Search, Terminal, ExternalLink, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface IPBX {
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

interface Country {
  id: string;
  name: string;
  code: string;
}

const IPBX_TYPES = ["FreePBX", "Asterisk", "Issabel", "3CX", "FusionPBX", "Autre"];

const emptyForm = {
  name: "", ip_address: "", type: "FreePBX", country_id: "",
  api_url: "", api_user: "", api_password: "",
  ami_user: "gvoip", ami_password: "gvoip2024", ami_port: "5038",
  ssh_user: "root", ssh_password: "", ssh_sudo_password: ""
};

const IPBXManagement = () => {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();

  const [ipbxList, setIpbxList] = useState<IPBX[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IPBX | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [configuring, setConfiguring] = useState(false);


  const fetchData = async () => {
    setLoading(true);
    const countryRes = await supabase.from("countries").select("id, name, code").order("name");
    if (countryRes.data) setCountries(countryRes.data as Country[]);

    let query: any = supabase.from("ipbx").select("*, countries(name, code)", { count: 'exact' });
    if (!isAdmin) {
      if (!user) { setIpbxList([]); setTotalCount(0); setLoading(false); return; }
      const { data: uiData } = await (supabase.from("user_ipbx" as any) as any)
        .select("ipbx_id").eq("user_id", user.id);
      const ids = uiData?.map((u: any) => u.ipbx_id) || [];
      if (ids.length === 0) { setIpbxList([]); setTotalCount(0); setLoading(false); return; }
      query = query.in("id", ids);
    }
    if (debouncedSearch) query = query.ilike("name", `%${debouncedSearch}%`);
    const { data, count } = await query.order("name").range(page * pageSize, page * pageSize + pageSize - 1);
    if (data) setIpbxList(data as IPBX[]);
    if (count !== null) setTotalCount(count);
    setLoading(false);
  };

  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => { fetchData(); }, [isAdmin, user, page, debouncedSearch]);

  const handleAutoConfig = async () => {
    if (!form.ip_address || !form.ami_user || !form.ami_password) {
      toast({ title: "Erreur", description: "IP, AMI User et AMI Password requis", variant: "destructive" });
      return;
    }
    setConfiguring(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const response = await fetch(`/api/setup-freepbx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ip: form.ip_address,
          ami_user: form.ami_user,
          ami_password: form.ami_password,
          ssh_user: form.ssh_user || "root",
          ssh_password: form.ssh_password || "",
          ssh_sudo_password: form.ssh_sudo_password || ""
        })
      });
      clearTimeout(timeout);
      if (response.ok) {
        toast({ title: "✅ Configuration réussie", description: `AMI configuré sur ${form.ip_address}` });
      } else {
        toast({ title: "Erreur configuration", variant: "destructive" });
      }
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Timeout — opération trop longue" : "Erreur réseau";
      toast({ title: msg, variant: "destructive" });
    }
    setConfiguring(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.ip_address) {
      toast({ title: "Erreur", description: "Nom et adresse IP sont obligatoires", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name, host: form.ip_address, ip_address: form.ip_address,
      type: form.type, country_id: form.country_id || null,
      api_url: form.api_url || null, api_user: form.api_user || null, api_password: form.api_password || null,
      ami_user: form.ami_user || null, ami_password: form.ami_password || null,
      ami_port: parseInt(form.ami_port) || 5038,
      ssh_user: form.ssh_user || "root",
      ssh_password: form.ssh_password || null,
      ssh_sudo_password: form.ssh_sudo_password || null,
      status: "unknown",
    };
    if (editing) {
      const { error } = await supabase.from("ipbx").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("ipbx").insert(payload);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: editing ? "IPBX modifié" : "IPBX ajouté", description: `${form.name} enregistré` });
    setOpen(false); setEditing(null); setForm(emptyForm); fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("ipbx").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "IPBX supprimé" }); fetchData();
  };

  const openEdit = (i: IPBX) => {
    setEditing(i);
    setForm({
      name: i.name || "", ip_address: i.ip_address || i.host || "",
      type: i.type || "FreePBX", country_id: i.country_id || "",
      api_url: i.api_url || "", api_user: i.api_user || "", api_password: i.api_password || "",
      ami_user: i.ami_user || "gvoip", ami_password: i.ami_password || "",
      ami_port: String(i.ami_port || 5038),
      ssh_user: i.ssh_user || "root", ssh_password: i.ssh_password || "",
      ssh_sudo_password: i.ssh_sudo_password || "",
    });
    setOpen(true);
  };

  const openWebSSH = (i: IPBX) => {
    const ip = i.ip_address || i.host;
    const user = i.ssh_user || "root";
    window.open(`http://${window.location.hostname}:9061/ssh?ip=${ip}&user=${user}`, "_blank");
  };

  const openGui = (i: IPBX) => {
    const ip = (i.ip_address || i.host || "").trim();
    if (!ip) return;
    window.open(`http://${ip}`, "_blank");
  };

  const getStatusColor = (status: string) => {
    if (status === "online") return "text-success";
    if (status === "offline" || status === "error") return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">IPBX</h1>
          <p className="text-sm text-muted-foreground">Gestion des autocommutateurs IP</p>
        </div>
        <div className="flex gap-2">
          {/* Bouton Patton SBC */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("https://www.patton.io/login", "_blank")}
          >
            <ExternalLink size={14} className="mr-1" /> Patton SBC
          </Button>

          {isAdmin && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus size={16} className="mr-1" /> Ajouter</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? "Modifier l'IPBX" : "Ajouter un IPBX"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">

                  {/* Infos générales */}
                  <div className="p-3 rounded-lg bg-muted/20 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Informations générales</p>
                    <div><Label>Nom *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="FreePBX-Lomé-01" className="mt-1" /></div>
                    <div><Label>Adresse IP *</Label><Input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.75" className="mt-1" /></div>
                    <div>
                      <Label>Type</Label>
                      <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{IPBX_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Pays</Label>
                      <Select value={form.country_id} onValueChange={(v) => setForm({ ...form, country_id: v })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Sélectionner un pays" /></SelectTrigger>
                        <SelectContent>{countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* SSH */}
                  <div className="p-3 rounded-lg bg-muted/20 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Accès SSH</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Utilisateur SSH</Label><Input value={form.ssh_user} onChange={(e) => setForm({ ...form, ssh_user: e.target.value })} placeholder="root" className="mt-1" /></div>
                      <div><Label>Mot de passe SSH</Label><Input type="password" value={form.ssh_password} onChange={(e) => setForm({ ...form, ssh_password: e.target.value })} placeholder="••••••••" className="mt-1" /></div>
                    </div>
                    {form.ssh_user !== "root" && (
                      <div><Label>Mot de passe sudo/su</Label><Input type="password" value={form.ssh_sudo_password} onChange={(e) => setForm({ ...form, ssh_sudo_password: e.target.value })} placeholder="Mot de passe superuser" className="mt-1" /></div>
                    )}
                  </div>

                  {/* API GraphQL */}
                  <div className="p-3 rounded-lg bg-muted/20 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">API GraphQL (optionnel)</p>
                    <div><Label>URL API</Label><Input value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} placeholder="http://192.168.1.75/admin/api/api/gql" className="mt-1" /></div>
                    <div><Label>Client ID</Label><Input value={form.api_user} onChange={(e) => setForm({ ...form, api_user: e.target.value })} placeholder="Client ID OAuth2" className="mt-1" /></div>
                    <div><Label>Client Secret</Label><Input type="password" value={form.api_password} onChange={(e) => setForm({ ...form, api_password: e.target.value })} placeholder="••••••••" className="mt-1" /></div>
                  </div>

                  {/* AMI */}
                  <div className="p-3 rounded-lg bg-muted/20 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Asterisk AMI (appels temps réel)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>AMI User</Label><Input value={form.ami_user} onChange={(e) => setForm({ ...form, ami_user: e.target.value })} placeholder="gvoip" className="mt-1" /></div>
                      <div><Label>AMI Port</Label><Input value={form.ami_port} onChange={(e) => setForm({ ...form, ami_port: e.target.value })} placeholder="5038" className="mt-1" /></div>
                    </div>
                    <div><Label>AMI Password</Label><Input type="password" value={form.ami_password} onChange={(e) => setForm({ ...form, ami_password: e.target.value })} placeholder="••••••••" className="mt-1" /></div>
                  </div>

                  {!editing && (
                    <Button onClick={handleAutoConfig} variant="outline" className="w-full" disabled={configuring}>
                      {configuring ? "Configuration en cours..." : "⚡ Configurer AMI automatiquement"}
                    </Button>
                  )}
                  <Button onClick={handleSave} className="w-full">{editing ? "Modifier" : "Ajouter"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Rechercher…" className="pl-9 h-9" />
      </div>

      {/* Liste IPBX */}
      <div className="grid gap-3">
        {loading ? (
          <p className="text-muted-foreground text-sm">Chargement...</p>
        ) : ipbxList.length === 0 ? (
          <div className="noc-card p-8 text-center border border-border">
            <Server className="mx-auto text-muted-foreground mb-2" size={32} />
            <p className="text-muted-foreground">Aucun IPBX configuré</p>
          </div>
        ) : (
          ipbxList.map((i) => (
            <motion.div key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="noc-card p-4 border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    {i.status === "online"
                      ? <Wifi size={18} className="text-success" />
                      : <WifiOff size={18} className="text-destructive" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-mono font-semibold text-foreground">{i.name}</p>
                      <span className={`text-xs font-bold uppercase ${getStatusColor(i.status)}`}>
                        {i.status || "unknown"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i.type} · {i.ip_address || i.host} · {i.countries?.name || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* Bouton WebSSH — accessible à tous */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => openWebSSH(i)}
                  >
                    <Terminal size={13} /> SSH
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => openGui(i)}
                  >
                    <Navigation size={13} /> GUI
                  </Button>

                  {isAdmin && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(i)}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(i.id)}><Trash2 size={14} /></Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalCount !== null && totalCount > pageSize && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(p - 1, 0))}>Précédent</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} / {Math.ceil((totalCount || 0) / pageSize)}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= (totalCount || 0)} onClick={() => setPage(p => p + 1)}>Suivant</Button>
        </div>
      )}

    </div>
  );
};

export default IPBXManagement;