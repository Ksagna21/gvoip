import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Lock, Upload, User } from "lucide-react";

const MAX_AVATAR_SIZE = 1024 * 1024; // 1 Mo
const AVATAR_BUCKET = "avatars";

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const initials = useMemo(() => {
    if (displayName?.trim()) return displayName.trim().charAt(0).toUpperCase();
    if (email?.trim()) return email.trim().charAt(0).toUpperCase();
    return "U";
  }, [displayName, email]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      setLoadingProfile(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, email, avatar_url")
        .eq("user_id", user.id)
        .single();

      if (error) {
        toast({
          title: "Erreur",
          description: "Impossible de charger le profil",
          variant: "destructive",
        });
      } else {
        setDisplayName(data?.display_name || "");
        setEmail(data?.email || user.email || "");
        setAvatarUrl(data?.avatar_url || null);
      }
      setLoadingProfile(false);
    };

    loadProfile();
  }, [toast, user]);

  const handleAvatarUpload = async (file?: File) => {
    if (!file || !user) return;

    // Validation type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Format invalide",
        description: "Veuillez selectionner une image",
        variant: "destructive",
      });
      return;
    }

    // Validation taille
    if (file.size > MAX_AVATAR_SIZE) {
      toast({
        title: "Image trop lourde",
        description: "Taille maximale : 1 Mo",
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);

    try {
      // Supprimer l'ancien avatar du bucket s'il existe
      if (avatarUrl) {
        const oldPath = avatarUrl.split(`/${AVATAR_BUCKET}/`)[1];
        if (oldPath) {
          await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
        }
      }

      // Construire un chemin unique : avatars/{user_id}/{timestamp}.{ext}
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      // Upload vers Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        toast({
          title: "Erreur upload",
          description: uploadError.message,
          variant: "destructive",
        });
        return;
      }

      // Recuperer l'URL publique
      const { data: urlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl ?? null;

      // Mettre a jour la BDD immediatement
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      if (dbError) {
        toast({
          title: "Erreur",
          description: dbError.message,
          variant: "destructive",
        });
        return;
      }

      setAvatarUrl(publicUrl);
      toast({ title: "Photo mise a jour", description: "Votre avatar a ete enregistre." });
    } catch (err) {
      toast({
        title: "Erreur inattendue",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profil mis a jour", description: "Les modifications ont ete enregistrees." });
    }
    setSavingProfile(false);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 8 caracteres", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Mot de passe mis a jour" });
    }
    setSavingPassword(false);
  };

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Chargement du profil...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mon profil</h1>
        <p className="text-sm text-muted-foreground">Mettre a jour votre photo et votre mot de passe.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Bloc profil ── */}
        <div className="noc-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold">Photo de profil</h2>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-2 ring-primary/20">
                <AvatarImage src={avatarUrl || undefined} alt={displayName || "Avatar"} />
                <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="avatar-file"
                className={`cursor-pointer inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${uploadingAvatar ? "pointer-events-none opacity-50" : ""}`}
              >
                <Upload size={14} />
                {uploadingAvatar ? "Upload en cours..." : "Choisir une photo"}
              </Label>
              <Input
                id="avatar-file"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">Formats image acceptes, max 1 Mo.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Nom affiche</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre nom"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={email} disabled />
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile || uploadingAvatar} className="w-full">
            {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            Enregistrer le profil
          </Button>
        </div>

        {/* ── Bloc mot de passe ── */}
        <div className="noc-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-semibold">Changer le mot de passe</h2>
          <form className="space-y-4" onSubmit={handleSavePassword}>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input
                  id="new-password"
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 caracteres"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmer"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <Button type="submit" disabled={savingPassword} className="w-full">
              {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mettre a jour le mot de passe
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
