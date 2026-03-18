import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Users, Shield, UserCog, Plus, Search, RefreshCw,
  Globe, Server, Eye, KeyRound, UserX, UserCheck, Mail, Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
}

interface UserRole { user_id: string; role: string; }
interface Country { id: string; name: string; code: string; }
interface Ipbx { id: string; name: string; ip_address: string; country_id: string; }
interface UserCountry { user_id: string; country_id: string; }
interface UserIpbx { user_id: string; ipbx_id: string; }
interface UserPermission { user_id: string; permission: string; }

const ALL_VIEWS = [
  { key: "dashboard", label: "Dashboard global", icon: Eye },
  { key: "dashboard_country", label: "Pays", icon: Globe },
  { key: "settings", label: "IPBX", icon: Server },
  { key: "sip_trunks", label: "SIP Trunks", icon: Server },
  { key: "extensions", label: "Extensions", icon: UserCog },
  { key: "cdr", label: "Appels / CDR", icon: Eye },
  { key: "quality", label: "Qualite VoIP", icon: Eye },
  { key: "alerts", label: "Alertes", icon: Eye },
  { key: "network_map", label: "Network Map", icon: Globe },
];

const UserManagement = () => {
  const { isAdmin, user: currentUser } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [ipbxList, setIpbxList] = useState<Ipbx[]>([]);
  const [userCountries, setUserCountries] = useState<UserCountry[]>([]);
  const [userIpbx, setUserIpbx] = useState<UserIpbx[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Create user form
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", display_name: "", role: "user" });
  const [creating, setCreating] = useState(false);

  // Reset password
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUser, setResetUser] = useState<Profile | null>(null);

  const fetchAll = useCallback(async () => {
    const [pRes, rRes, cRes, iRes, ucRes, uiRes, upRes] = await Promise.all([
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("countries").select("id, name, code").order("name"),
      supabase.from("ipbx").select("id, name, ip_address, country_id").order("name"),
      supabase.from("user_countries").select("user_id, country_id"),
      supabase.from("user_ipbx" as any).select("user_id, ipbx_id"),
      supabase.from("user_permissions" as any).select("user_id, permission"),
    ]);
    if (pRes.data) setProfiles(pRes.data as Profile[]);
    if (rRes.data) setRoles(rRes.data as UserRole[]);
    if (cRes.data) setCountries(cRes.data as Country[]);
    if (iRes.data) setIpbxList(iRes.data as Ipbx[]);
    if (ucRes.data) setUserCountries(ucRes.data as UserCountry[]);
    if (uiRes.data) setUserIpbx((uiRes.data as any) || []);
    if (upRes.data) setUserPermissions((upRes.data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Recharger quand on revient sur l'onglet
  useEffect(() => {
    const onFocus = () => fetchAll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAll]);

  const getUserRole = (userId: string) => roles.find((r) => r.user_id === userId)?.role || "user";
  const getUserCountryIds = (userId: string) => userCountries.filter((uc) => uc.user_id === userId).map((uc) => uc.country_id);
  const getUserIpbxIds = (userId: string) => userIpbx.filter((ui) => ui.user_id === userId).map((ui) => ui.ipbx_id);
  const getUserPerms = (userId: string) => userPermissions.filter((up) => up.user_id === userId).map((up) => up.permission);

  const handleRoleChange = async (userId: string, newRole: string) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole } as any);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Rôle mis à jour" });
    fetchAll();
  };

  const toggleCountry = async (userId: string, countryId: string, assigned: boolean) => {
    if (assigned) {
      setUserCountries(prev => prev.filter(c => !(c.user_id === userId && c.country_id === countryId)));
      await supabase.from("user_countries").delete().eq("user_id", userId).eq("country_id", countryId);
    } else {
      setUserCountries(prev => [...prev, { user_id: userId, country_id: countryId }]);
      await supabase.from("user_countries").insert({ user_id: userId, country_id: countryId });
    }
    fetchAll();
  };

  const toggleIpbx = async (userId: string, ipbxId: string, assigned: boolean) => {
    if (assigned) {
      setUserIpbx(prev => prev.filter(i => !(i.user_id === userId && i.ipbx_id === ipbxId)));
      await (supabase.from("user_ipbx" as any) as any).delete().eq("user_id", userId).eq("ipbx_id", ipbxId);
    } else {
      setUserIpbx(prev => [...prev, { user_id: userId, ipbx_id: ipbxId }]);
      await (supabase.from("user_ipbx" as any) as any).insert({ user_id: userId, ipbx_id: ipbxId });
    }
    fetchAll();
  };

  const togglePermission = async (userId: string, permission: string, has: boolean) => {
    // Mise a jour optimiste immediate
    if (has) {
      setUserPermissions(prev => prev.filter(p => !(p.user_id === userId && p.permission === permission)));
      await (supabase.from("user_permissions" as any) as any).delete().eq("user_id", userId).eq("permission", permission);
    } else {
      setUserPermissions(prev => [...prev, { user_id: userId, permission }]);
      await (supabase.from("user_permissions" as any) as any).insert({ user_id: userId, permission });
    }
    fetchAll();
  };

  const toggleActive = async (profile: Profile) => {
    const { error } = await supabase.from("profiles").update({ is_active: !profile.is_active }).eq("id", profile.id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: profile.is_active ? "Utilisateur désactivé" : "Utilisateur activé" });
    fetchAll();
  };

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password) {
      toast({ title: "Erreur", description: "Email et mot de passe requis", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      // Créer user via API admin (sans déconnecter l'admin courant)
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          email_confirm: true,
          user_metadata: { display_name: createForm.display_name || createForm.email.split("@")[0] },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Erreur", description: data.message || data.error || "Erreur création", variant: "destructive" });
        setCreating(false);
        return;
      }
      // Créer profil
      await supabase.from("profiles").upsert({
        user_id: data.id,
        email: createForm.email,
        display_name: createForm.display_name || createForm.email.split("@")[0],
        is_active: true,
        force_password_change: true,
      }, { onConflict: "user_id" });
      // Set role
      if (createForm.role === "admin") {
        await supabase.from("user_roles").delete().eq("user_id", data.id);
        await supabase.from("user_roles").insert({ user_id: data.id, role: "admin" } as any);
      }
      toast({ title: "Utilisateur cree", description: `${createForm.email} peut maintenant se connecter` });
      setCreateOpen(false);
      setCreateForm({ email: "", password: "", display_name: "", role: "user" });
      setTimeout(fetchAll, 500);
    } catch(e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setCreating(false);
  };

  const handleResetPassword = async () => {
    if (!resetUser?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(resetUser.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email envoyé", description: `Lien de réinitialisation envoyé à ${resetUser.email}` });
    }
    setResetOpen(false);
    setResetUser(null);
  };

  const handleDeleteUser = async (profile: Profile) => {
    if (!confirm(`Supprimer definitivement ${profile.email} ?`)) return;
    try {
      // 1. Supprimer les données liées
      await Promise.all([
        supabase.from("user_roles").delete().eq("user_id", profile.user_id),
        supabase.from("user_countries").delete().eq("user_id", profile.user_id),
        (supabase.from("user_ipbx" as any) as any).delete().eq("user_id", profile.user_id),
        (supabase.from("user_permissions" as any) as any).delete().eq("user_id", profile.user_id),
      ]);
      // 2. Supprimer le profil
      await supabase.from("profiles").delete().eq("user_id", profile.user_id);
      // 3. Supprimer l'user auth
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${profile.user_id}`, {
        method: "DELETE",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: "Erreur", description: d.message || "Erreur suppression", variant: "destructive" });
        return;
      }
      toast({ title: "Utilisateur supprime" });
      fetchAll();
    } catch(e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    const q = search.toLowerCase();
    return !q || (p.display_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <Shield className="text-muted-foreground mr-2" size={20} />
        <p className="text-muted-foreground">Accès réservé aux administrateurs</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admin Panel — Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">RBAC, permissions, accès pays/IPBX/vues</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw size={14} className="mr-1" /> Sync
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1" /> Créer utilisateur
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-9 h-9" />
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{profiles.length} utilisateurs</span>
        <span>{roles.filter(r => r.role === "admin").length} admins</span>
        <span>{profiles.filter(p => !p.is_active).length} désactivés</span>
      </div>

      {/* User list */}
      <div className="grid gap-3">
        {loading && profiles.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chargement...</p>
        ) : filteredProfiles.length === 0 ? (
          <div className="noc-card p-8 text-center border border-border">
            <Users className="mx-auto text-muted-foreground mb-2" size={32} />
            <p className="text-muted-foreground">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          filteredProfiles.map((p) => {
            const role = getUserRole(p.user_id);
            const assignedCountries = getUserCountryIds(p.user_id);
            const assignedIpbx = getUserIpbxIds(p.user_id);
            const perms = getUserPerms(p.user_id);
            const isCurrent = p.user_id === currentUser?.id;

            return (
              <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`noc-card p-4 border border-border transition-all ${!p.is_active ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${role === "admin" ? "bg-warning/10" : "bg-primary/10"}`}>
                      {role === "admin" ? <Shield size={18} className="text-warning" /> : <UserCog size={18} className="text-primary" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{p.display_name || "—"}</p>
                        {isCurrent && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Vous</Badge>}
                        {!p.is_active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Désactivé</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {role === "admin" ? (
                          <span className="text-[10px] text-warning font-medium">Accès complet</span>
                        ) : (
                          <>
                            {assignedCountries.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {assignedCountries.length} pays
                              </Badge>
                            )}
                            {assignedIpbx.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {assignedIpbx.length} IPBX
                              </Badge>
                            )}
                            {perms.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {perms.length} vues
                              </Badge>
                            )}
                            {assignedCountries.length === 0 && perms.length === 0 && (
                              <span className="text-[10px] text-muted-foreground">Aucun accès</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select value={role} onValueChange={(v) => handleRoleChange(p.user_id, v)} disabled={isCurrent}>
                      <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { setSelectedUser(p); setPanelOpen(true); }}>
                      Permissions
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset mot de passe"
                      onClick={() => { setResetUser(p); setResetOpen(true); }}>
                      <KeyRound size={14} />
                    </Button>
                    {!isCurrent && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title={p.is_active ? "Désactiver" : "Activer"}
                        onClick={() => toggleActive(p)}>
                        {p.is_active ? <UserX size={14} className="text-destructive" /> : <UserCheck size={14} className="text-success" />}
                      </Button>
                    )}
                    {!isCurrent && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Supprimer le compte"
                        onClick={() => handleDeleteUser(p)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Permissions panel */}
      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield size={18} />
              Permissions — {selectedUser?.display_name || selectedUser?.email}
            </DialogTitle>
          </DialogHeader>

          {selectedUser && getUserRole(selectedUser.user_id) === "admin" ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Shield size={32} className="mx-auto text-warning mb-2" />
              Les administrateurs ont un accès complet à toutes les ressources.
            </div>
          ) : selectedUser && (
            <Tabs defaultValue="countries" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="countries" className="flex-1 text-xs">
                  <Globe size={12} className="mr-1" /> Pays
                </TabsTrigger>
                <TabsTrigger value="ipbx" className="flex-1 text-xs">
                  <Server size={12} className="mr-1" /> IPBX
                </TabsTrigger>
                <TabsTrigger value="views" className="flex-1 text-xs">
                  <Eye size={12} className="mr-1" /> Vues
                </TabsTrigger>
              </TabsList>

              {/* Countries */}
              <TabsContent value="countries" className="space-y-2 mt-3">
                <p className="text-xs text-muted-foreground mb-2">Pays auxquels l'utilisateur a accès :</p>
                {countries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ajoutez d'abord des pays</p>
                ) : (
                  countries.map((c) => {
                    const assigned = getUserCountryIds(selectedUser.user_id).includes(c.id);
                    return (
                      <div key={c.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/30">
                        <div className="flex items-center gap-2">
                          <Checkbox checked={assigned}
                            onCheckedChange={() => toggleCountry(selectedUser.user_id, c.id, assigned)} />
                          <span className="text-sm">{c.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{c.code}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>

              {/* IPBX */}
              <TabsContent value="ipbx" className="space-y-2 mt-3">
                <p className="text-xs text-muted-foreground mb-2">IPBX autorisées (en plus de l'accès pays) :</p>
                {ipbxList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun IPBX configuré</p>
                ) : (
                  ipbxList.map((ipbx) => {
                    const assigned = getUserIpbxIds(selectedUser.user_id).includes(ipbx.id);
                    const countryName = countries.find(c => c.id === ipbx.country_id)?.name || "";
                    return (
                      <div key={ipbx.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/30">
                        <div className="flex items-center gap-2">
                          <Checkbox checked={assigned}
                            onCheckedChange={() => toggleIpbx(selectedUser.user_id, ipbx.id, assigned)} />
                          <div>
                            <span className="text-sm">{ipbx.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{ipbx.ip_address}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{countryName}</span>
                      </div>
                    );
                  })
                )}
              </TabsContent>

              {/* Views */}
              <TabsContent value="views" className="space-y-2 mt-3">
                <p className="text-xs text-muted-foreground mb-2">Vues autorisées dans l'interface :</p>
                {ALL_VIEWS.map((view) => {
                  const has = getUserPerms(selectedUser.user_id).includes(view.key);
                  return (
                    <div key={view.key} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/30">
                      <div className="flex items-center gap-2">
                        <view.icon size={14} className="text-muted-foreground" />
                        <span className="text-sm">{view.label}</span>
                      </div>
                      <Switch checked={has}
                        onCheckedChange={() => togglePermission(selectedUser.user_id, view.key, has)} />
                    </div>
                  );
                })}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={18} /> Créer un utilisateur
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Nom affiché</Label>
              <Input value={createForm.display_name} onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })} placeholder="Jean Dupont" className="mt-1" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="jean@example.com" className="mt-1" />
            </div>
            <div>
              <Label>Mot de passe *</Label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Min. 6 caractères" className="mt-1" />
            </div>
            <div>
              <Label>Rôle</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} className="w-full" disabled={creating}>
              {creating ? "Création…" : "Créer l'utilisateur"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">Le compte sera actif immediatement.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={18} /> Réinitialiser le mot de passe
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Un lien de réinitialisation sera envoyé à <strong>{resetUser?.email}</strong>.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setResetOpen(false)}>Annuler</Button>
              <Button className="flex-1" onClick={handleResetPassword}>
                <Mail size={14} className="mr-1" /> Envoyer le lien
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
