import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const ChangePassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Erreur", description: "Minimum 8 caracteres", variant: "destructive" }); return;
    }
    if (newPassword !== confirm) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast({ title: "Erreur", description: "Session expirée, reconnectez-vous", variant: "destructive" });
        setLoading(false);
        return;
      }
      // Mettre à jour le profil AVANT updateUser pour éviter les race conditions.
      await supabase.from("profiles").update({ force_password_change: false }).eq("user_id", user.id);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        // Rollback si échec.
        await supabase.from("profiles").update({ force_password_change: true }).eq("user_id", user.id);
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      toast({ title: "Mot de passe mis a jour", description: "Bienvenue !" });
      setTimeout(() => window.location.reload(), 800);
    } catch(e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-3 sm:p-4 relative overflow-hidden bg-background text-foreground transition-colors duration-500"
      style={{
        backgroundImage:
          "linear-gradient(115deg, hsl(222 85% 8% / 0.82), hsl(228 64% 6% / 0.72)), url('/fond_login_voip.png'), url('/fond_login.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[#061033cc] via-[#050a1a66] to-primary/20" />

      <div className="relative w-full z-10 max-w-4xl xl:max-w-[1100px] transition-all duration-500">
        <div className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-card/95 backdrop-blur-md border border-border shadow-[0_18px_70px_hsl(0_0%_0%_/_0.2)] dark:shadow-[0_30px_95px_hsl(0_0%_0%_/_0.55)] transition-all duration-500">
          <div className="grid xl:grid-cols-[43%_57%]">
            <div className="hidden xl:flex m-3 rounded-[1.4rem] overflow-hidden relative min-h-[500px]">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to bottom, rgba(2,12,36,0.2), rgba(2,12,36,0.72)), url('/fond_login_voip.png'), url('/fond_login.jpg')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div className="relative z-10 p-8 flex flex-col justify-between text-white w-full">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-xs tracking-[0.2em] font-bold text-white/90">SECURITE COMPTE</p>
                    <h2 className="text-4xl font-extrabold leading-[0.95]">Premiere connexion</h2>
                  </div>
                  <div className="w-12 h-12 rounded-2xl border border-white/45 bg-white/10 backdrop-blur flex items-center justify-center">
                    <img src="/GVOIP.png" alt="GVoIP" className="w-7 h-7 object-contain" />
                  </div>
                </div>
                <div className="space-y-2 text-xs text-white/85">
                  <p className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-cyan-300" />
                    Changement de mot de passe obligatoire pour activer la session.
                  </p>
                  <p className="text-white/70">Choisissez un mot de passe unique et robuste.</p>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-7 md:p-8 xl:px-10 xl:py-10 min-h-[460px] sm:min-h-[500px] xl:min-h-[500px] flex flex-col justify-center">
              <div className="flex flex-col items-center lg:items-start mb-8">
                <div className="lg:hidden w-13 h-13 rounded-xl flex items-center justify-center mb-4 bg-background border border-border shadow-[0_4px_16px_hsl(0_0%_0%_/_0.06)] dark:shadow-[0_4px_16px_hsl(0_0%_0%_/_0.5)] transition-all duration-500" style={{ width: 52, height: 52 }}>
                  <img src="/GVOIP.png" alt="GVoIP" className="w-9 h-9 object-contain" />
                </div>
                <h1 className="text-3xl sm:text-[2rem] font-extrabold tracking-tight text-foreground transition-colors duration-500">
                  NOUVEAU MOT DE PASSE
                </h1>
                <p className="text-[13px] mt-2 font-semibold text-muted-foreground transition-colors duration-500">
                  Vous devez definir un nouveau mot de passe avant de continuer.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground transition-colors duration-500" />
                  <input
                    id="np"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 caracteres"
                    minLength={8}
                    required
                    className="w-full rounded-xl pl-10 pr-11 py-3 text-[14px] font-semibold outline-none transition-all duration-200 focus:ring-1 bg-background border border-input text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground transition-colors duration-500" />
                  <input
                    id="cp"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirmer le mot de passe"
                    required
                    className="w-full rounded-xl pl-10 pr-11 py-3 text-[14px] font-semibold outline-none transition-all duration-200 focus:ring-1 bg-background border border-input text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full mt-1 rounded-xl py-3 text-[14px] font-bold text-white flex items-center justify-center gap-2 transition-all duration-200 tracking-[0.01em] ${
                    loading
                      ? "bg-primary/70 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90 active:scale-[0.99] cursor-pointer"
                  }`}
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Valider et acceder
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
