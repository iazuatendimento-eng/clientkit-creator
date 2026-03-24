import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { refreshSessionIfNeeded } from "@/hooks/useAuth";

/**
 * Global keep-alive hook: pings the database every 2 minutes.
 * If a ping returns JWT expired, it refreshes the token automatically.
 */
export function useKeepAlive() {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const ping = async () => {
      const { error } = await supabase.from("teams").select("id").limit(1).maybeSingle();
      if (error?.message?.includes("JWT expired") || error?.code === "PGRST303") {
        console.log("[KeepAlive] JWT expired, refreshing...");
        await refreshSessionIfNeeded();
      }
    };

    ping();
    intervalRef.current = window.setInterval(ping, 2 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        ping();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}
