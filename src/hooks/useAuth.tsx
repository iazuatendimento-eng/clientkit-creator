import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Attempt to refresh the session token. Returns true if successful.
 * This is called globally whenever a "JWT expired" error is detected.
 */
let refreshPromise: Promise<boolean> | null = null;
export async function refreshSessionIfNeeded(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        console.warn("[Auth] Token refresh failed, redirecting to login");
        await supabase.auth.signOut();
        window.location.href = "/auth";
        return false;
      }
      console.log("[Auth] Token refreshed successfully");
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const safetyTimeout = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 8000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "TOKEN_REFRESHED") {
        console.log("[Auth] Token auto-refreshed by Supabase client");
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      window.clearTimeout(safetyTimeout);
    });

    const fetchSession = async (attempt = 0) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;

        // If session exists but token is about to expire (< 2 min), refresh proactively
        if (session?.expires_at) {
          const expiresIn = session.expires_at - Math.floor(Date.now() / 1000);
          if (expiresIn < 120) {
            console.log("[Auth] Token expiring soon, refreshing proactively...");
            await refreshSessionIfNeeded();
            return; // onAuthStateChange will handle the new session
          }
        }

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
