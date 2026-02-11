import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const safetyTimeout = window.setTimeout(() => {
      // Safety net: avoid infinite loading screens if auth/network hangs.
      if (active) setLoading(false);
    }, 8000);

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      window.clearTimeout(safetyTimeout);
    });

    // THEN check for existing session with retry
    const fetchSession = async (attempt = 0) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        window.clearTimeout(safetyTimeout);
      } catch {
        if (!active) return;
        if (attempt < 2) {
          window.setTimeout(() => fetchSession(attempt + 1), (attempt + 1) * 2000);
        } else {
          setLoading(false);
          window.clearTimeout(safetyTimeout);
        }
      }
    };
    fetchSession();

    return () => {
      active = false;
      window.clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return { user, session, loading, signOut };
};
