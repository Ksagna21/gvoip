import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Lock, Upload, User } from "lucide-react";

const MAX_AVATAR_SIZE = 1024 * 1024;
const AVATAR_BUCKET = "avatars";

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { profile, refreshProfile } = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Synchroniser les champs depuis le contexte partagé
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setEmail(profile.email || user?.email || "");
      setAvatarUrl(profile.avatar_url || null);
      setLoadingProfile(false);
    }
  }, [profile, user]);

  const initials = useMemo(() => {
    if (displayName?.trim()) return displayName.trim().charAt(0).toUpperCase();
    if (email?.trim()) return email.trim().charAt(0).toUpperCase();
    return "U";
  }, [displayName, email]);

  const handleAvatarUpload = async (file?: File) => {
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Format invalide", description: "Veuillez selectionner une image", variant: "destructive" });
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast({ title: "Image trop lourde", description: "Taille maximale : 1 Mo", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    try {
      if (avatarUrl) {
        const oldPath = avatarUrl.split(`/${AVATAR_BUCKET}/`)[1];
        if (oldPath) await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
      }

      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, file, { cacheControl: "3600", upsert: true, contentType: file.type });

      if (uploadError) {
        toast({ title: "Erreur upload", description: uploadError.message, variant: "destructive" });
        return;
      }

      const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      const publicUrl = urlData?.publicUrl ?? null;

      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      if (dbError) {
        toast({ title: "Erreur", description: dbError.message, variant: "destructive" });
        return;
      }

      setAvatarUrl(publicUrl);
      await refreshProfile(); // ← sidebar mise à jour instantanément
      toast({ title: "Photo mise a jour", description: "Votre avatar a ete enregistre." });
    } catch (err) {
      toast({ title: "Erreur inattendue", description: String(err), variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      await refreshProfile(); // ← le nom se met à jour dans la sidebar instantanément
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
        <p className="text-sm text-muted-foreground">Mettre a jour votre photo, votre nom et votre securite.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Bloc profil ── */}
        <div className="noc-card border border-border rounded-2xl p-8 space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="text-lg font-semibold">Photo de profil</h2>
            <p className="text-sm text-muted-foreground">Avatar, nom et identite de compte.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-5">
            <div className="relative">
              <Avatar className="h-28 w-28 bg-muted/20 ring-2 ring-primary/25">
                <AvatarImage src={avatarUrl || undefined} alt={displayName || "Avatar"} />
                <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
              </Avatar>

              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20 dark:bg-black/50">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xl font-bold text-foreground">{displayName || "Utilisateur"}</div>
              <div className="text-sm text-muted-foreground">{email || "—"}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="avatar-file"
              className={`cursor-pointer inline-flex items-center justify-center gap-2 w-full rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                uploadingAvatar ? "pointer-events-none opacity-50" : ""
              }`}
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
            <p className="text-xs text-muted-foreground text-center">Formats image acceptes, max 1 Mo.</p>
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
            {savingProfile ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            Enregistrer le profil
          </Button>
        </div>

        {/* ── Bloc mot de passe ── */}
        <div className="noc-card border border-border rounded-2xl p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Changer le mot de passe</h2>
            <p className="text-sm text-muted-foreground">Mettez a jour votre securite.</p>
          </div>
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
