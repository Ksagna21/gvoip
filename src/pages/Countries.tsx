import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Globe, Plus, Pencil, Trash2, BarChart3, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface Country {
  id: string;
  name: string;
  code: string;
  timezone: string;
  created_at: string;
}

const getFlagEmoji = (code: string) => {
  if (!code || code.length < 2) return "🌍";
  return code.toUpperCase().slice(0, 2).split("")
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
};

/* ── Card wrapper ─────────────────────────────────────────── */
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-card border border-border rounded-2xl ${className}`}>
    {children}
  </div>
);

const Countries = () => {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [countries, setCountries]   = useState<Country[]>([]);
  const [loading, setLoading]       = useState(true);
  const [open, setOpen]             = useState(false);
  const [editing, setEditing]       = useState<Country | null>(null);
  const [search, setSearch]         = useState("");
  const [form, setForm]             = useState({ name: "", code: "", timezone: "UTC" });

  const fetchCountries = async () => {
    if (isAdmin) {
      const { data, error } = await supabase.from("countries").select("*").order("name");
      if (!error && data) setCountries(data as Country[]);
    } else if (user) {
      const { data: ucData } = await supabase.from("user_countries")
        .select("country_id").eq("user_id", user.id);
      const ids = ucData?.map((uc: any) => uc.country_id) || [];
      if (ids.length > 0) {
        const { data } = await supabase.from("countries")
          .select("*").in("id", ids).order("name");
        if (data) setCountries(data as Country[]);
      } else {
        setCountries([]);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchCountries(); }, [isAdmin, user]);

  const handleSave = async () => {
    if (editing) {
      const { error } = await supabase.from("countries").update(form).eq("id", editing.id);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("countries").insert(form);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: editing ? "Pays modifié" : "Pays ajouté" });
    setOpen(false);
    setEditing(null);
    setForm({ name: "", code: "", timezone: "UTC" });
    fetchCountries();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // ← empêche la navigation vers le dashboard
    const { error } = await supabase.from("countries").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pays supprimé" });
    fetchCountries();
  };

  const openEdit = (e: React.MouseEvent, c: Country) => {
    e.stopPropagation(); // ← empêche la navigation vers le dashboard
    setEditing(c);
    setForm({ name: c.name, code: c.code, timezone: c.timezone });
    setOpen(true);
  };

  const filteredCountries = countries.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 pb-8" style={{ fontFamily: "'Raleway', sans-serif" }}>

      {/* ── En-tête ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Pays</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-medium">
            Supervision par zone géographique
          </p>
        </div>
        {isAdmin && (
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) { setEditing(null); setForm({ name: "", code: "", timezone: "UTC" }); }
            }}
          >
            <DialogTrigger asChild>
              <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                <Plus size={13} /> Ajouter un pays
              </button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-black text-foreground">
                  {editing ? "Modifier le pays" : "Ajouter un pays"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nom</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="France" className="mt-1 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Code pays (ISO 3166-1)</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Input value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="FR" maxLength={3} className="rounded-xl" />
                    {form.code.length >= 2 && (
                      <span className="text-3xl">{getFlagEmoji(form.code)}</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fuseau horaire</Label>
                  <Input value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    placeholder="Europe/Paris" className="mt-1 rounded-xl" />
                </div>
                <button onClick={handleSave}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                  {editing ? "Modifier" : "Ajouter"}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Barre de recherche ──────────────────────────────── */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un pays…"
          className="pl-9 h-9 rounded-xl text-sm"
        />
      </div>

      {/* ── Liste des pays ──────────────────────────────────── */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 bg-muted rounded" />
                    <div className="h-2.5 w-16 bg-muted rounded" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : countries.length === 0 ? (
          <Card className="p-10 text-center">
            <Globe className="mx-auto text-muted-foreground mb-3" size={28} />
            <p className="text-sm font-semibold text-muted-foreground">Aucun pays configuré</p>
          </Card>
        ) : filteredCountries.length === 0 ? (
          <Card className="p-10 text-center">
            <Globe className="mx-auto text-muted-foreground mb-3" size={28} />
            <p className="text-sm font-semibold text-muted-foreground">Aucun pays trouvé pour « {search} »</p>
          </Card>
        ) : (
          filteredCountries.map((c, idx) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              onClick={() => navigate(`/countries/${c.id}`)}
              className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center justify-between cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all duration-200 group"
            >
              {/* Infos pays */}
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-muted/60 flex items-center justify-center text-2xl shrink-0">
                  {getFlagEmoji(c.code)}
                </div>
                <div>
                  <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors">
                    {c.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {c.code} · {c.timezone}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {/* Dashboard — stopPropagation via Link click */}
                <Link
                  to={`/countries/${c.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-primary/10 transition-colors">
                    <BarChart3 size={14} className="text-primary" />
                  </button>
                </Link>

                {isAdmin && (
                  <>
                    {/* Modifier */}
                    <button
                      onClick={(e) => openEdit(e, c)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Pencil size={14} className="text-muted-foreground" />
                    </button>

                    {/* Supprimer */}
                    <button
                      onClick={(e) => handleDelete(e, c.id)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 size={14} className="text-destructive" />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default Countries;
