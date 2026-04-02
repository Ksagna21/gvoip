import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2, Lock, Mail, Moon, ShieldCheck, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/* ── Dark mode global (html.dark) avec persistance ───────────── */
const useDarkMode = () => {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark);
    return prefersDark;
  });

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return { dark, toggle };
};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { dark, toggle } = useDarkMode();
  const { toast } = useToast();

  useEffect(() => { setMounted(true); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Erreur de connexion", description: "Email ou mot de passe incorrect", variant: "destructive" });
    }
    setLoading(false);
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

      {/* Card */}
      <div className={`relative w-full z-10 max-w-4xl xl:max-w-[1100px] transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-card/95 backdrop-blur-md border border-border shadow-[0_18px_70px_hsl(0_0%_0%_/_0.2)] dark:shadow-[0_30px_95px_hsl(0_0%_0%_/_0.55)] transition-all duration-500">

          {/* Theme toggle button */}
          <button
            onClick={toggle}
            className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 bg-card/85 hover:bg-card border border-border text-muted-foreground hover:text-foreground z-20"
            aria-label="Toggle theme"
          >
            {dark ? <Sun size={14} className="text-cyan-400" /> : <Moon size={14} />}
          </button>

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
                    <p className="text-xs tracking-[0.2em] font-bold text-white/90">BIENVENUE SUR</p>
                    <h2 className="text-4xl font-extrabold leading-[0.95]">
                      GVoIP
                    </h2>
                  </div>
                  <div className="w-12 h-12 rounded-2xl border border-white/45 bg-white/10 backdrop-blur flex items-center justify-center">
                    <img src="/GVOIP.png" alt="GVoIP" className="w-7 h-7 object-contain" />
                  </div>
                </div>

                <div className="space-y-2 text-xs text-white/85">
                  <p className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-cyan-300" />
                    Premiere connexion: changement de mot de passe obligatoire.
                  </p>
                  <p className="text-white/70">Les droits d&apos;acces sont synchronises avec votre profil.</p>
                </div>
              </div>
            </div>

            {/* Form side */}
            <div className="p-5 sm:p-7 md:p-8 xl:px-10 xl:py-10 min-h-[460px] sm:min-h-[500px] xl:min-h-[500px] flex flex-col justify-center">
              {/* Logo + heading */}
              <div className="flex flex-col items-center lg:items-start mb-8">
                <div className="lg:hidden w-13 h-13 rounded-xl flex items-center justify-center mb-4 bg-background border border-border shadow-[0_4px_16px_hsl(0_0%_0%_/_0.06)] dark:shadow-[0_4px_16px_hsl(0_0%_0%_/_0.5)] transition-all duration-500" style={{ width: 52, height: 52 }}>
                  <img src="/GVOIP.png" alt="GVoIP" className="w-9 h-9 object-contain" />
                </div>
                <h1 className="text-3xl sm:text-[2rem] font-extrabold tracking-tight text-foreground transition-colors duration-500">CONNECTEZ-VOUS</h1>
                <p className="text-[13px] mt-2 font-semibold text-muted-foreground transition-colors duration-500">
                  Entrez vos informations d&apos;identification.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                {/* Email input */}
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground transition-colors duration-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Adresse mail"
                    required
                    autoComplete="username"
                    className="w-full rounded-xl pl-10 pr-4 py-3 text-[14px] font-semibold outline-none transition-all duration-200 focus:ring-1 bg-background border border-input text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-primary/20"
                  />
                </div>

                {/* Password input */}
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground transition-colors duration-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe"
                    required
                    minLength={6}
                    autoComplete="current-password"
                    className="w-full rounded-xl pl-10 pr-11 py-3 text-[14px] font-semibold outline-none transition-all duration-200 focus:ring-1 bg-background border border-input text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Submit */}
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
                  Se connecter
                </button>
              </form>

              <div className="flex items-center gap-3 my-5">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground">Ou</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                className="w-full rounded-xl py-3 text-[14px] font-semibold border border-input text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                Continuer avec le SSO (bientot)
              </button>

              <p className="text-[11px] text-muted-foreground mt-5">
                Pour des raisons de securite, les comptes nouvellement crees doivent modifier leur mot de passe a la premiere connexion.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;