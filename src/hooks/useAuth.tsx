import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isActive: boolean;
  forcePasswordChange: boolean;
  authReady: boolean;
  viewPermissions: string[];
  loading: boolean;
  signOut: () => Promise<void>;
  canView: (view: string) => boolean;
}

const AuthContext = createContext<AuthContext>({
  user: null, session: null, isAdmin: false, isActive: false, forcePasswordChange: false, authReady: false,
  viewPermissions: [], loading: true,
  signOut: async () => {},
  canView: () => false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [viewPermissions, setViewPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (userId: string, retry = 0) => {
    const [roleRes, profileRes, permRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("is_active, force_password_change").eq("user_id", userId).single(),
      supabase.from("user_permissions" as any).select("permission").eq("user_id", userId),
    ]);
    // Retry si profil pas encore créé (max 5 fois)
    if (!profileRes.data && retry < 5) {
      await new Promise(r => setTimeout(r, 500));
      return loadUserData(userId, retry + 1);
    }
    const roles = roleRes.data?.map((r: any) => r.role) || [];
    const admin = roles.includes("admin");
    setIsAdmin(admin);
    setIsActive(admin || profileRes.data?.is_active !== false);
    // Enforce first-login password change for every user when flagged.
    setForcePasswordChange(profileRes.data?.force_password_change === true);
    setViewPermissions(admin ? ["all"] : (permRes.data?.map((p: any) => p.permission) || []));
    setAuthReady(true);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Ignorer USER_UPDATED pour eviter race condition avec ChangePassword
        if (event !== "USER_UPDATED") {
          await loadUserData(session.user.id);
        }
      } else {
        setIsAdmin(false); setIsActive(false); setForcePasswordChange(false); setViewPermissions([]);
        setTimeout(() => setAuthReady(false), 0);
      }
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setUser(session?.user ?? null);
      if (session?.user) loadUserData(session.user.id);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };
  const canView = (view: string) => isAdmin || viewPermissions.includes("all") || viewPermissions.includes(view);

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, isActive, forcePasswordChange, authReady, viewPermissions, loading, signOut, canView }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
