import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useAllowedIpbx = () => {
  const { isAdmin, user } = useAuth();
  const [allowedIpbxIds, setAllowedIpbxIds] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      setReady(false);
      if (isAdmin) { setAllowedIpbxIds(null); setReady(true); return; }
      if (!user)   { setAllowedIpbxIds([]);   setReady(true); return; }

      // user_countries et user_ipbx partent en parallele — gain ~1-2s
      const [{ data: uc }, { data: ui }] = await Promise.all([
        supabase.from("user_countries").select("country_id").eq("user_id", user.id),
        supabase.from("user_ipbx" as any).select("ipbx_id").eq("user_id", user.id),
      ]);

      const countryIds   = uc?.map((c: any) => c.country_id) || [];
      const ipbxDirect: string[] = (ui as any)?.map((i: any) => i.ipbx_id) || [];

      // 3e requete seulement si l'utilisateur a des pays assignes
      let ipbxFromCountries: string[] = [];
      if (countryIds.length > 0) {
        const { data: ipbxData } = await supabase.from("ipbx").select("id").in("country_id", countryIds);
        ipbxFromCountries = ipbxData?.map((i: any) => i.id) || [];
      }

      setAllowedIpbxIds(Array.from(new Set([...ipbxFromCountries, ...ipbxDirect])));
      setReady(true);
    };
    load();
  }, [isAdmin, user]);

  const applyFilter = useCallback((query: any) => {
    if (isAdmin) return query;
    if (allowedIpbxIds && allowedIpbxIds.length > 0) return query.in("ipbx_id", allowedIpbxIds);
    // Aucun IPBX autorisé — forcer résultat vide
    return query.in("ipbx_id", ["00000000-0000-0000-0000-000000000000"]);
  }, [isAdmin, allowedIpbxIds]);

  return { allowedIpbxIds, isAdmin, ready, applyFilter };
};
