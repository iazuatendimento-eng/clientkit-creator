import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global keep-alive hook: pings the database every 2 minutes to prevent
 * cold-start hibernation. Also pings immediately on mount and whenever
 * the tab becomes visible again (e.g. user switches back to the app).
 */
export function useKeepAlive() {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const ping = () => {
      supabase.from("teams").select("id").limit(1).maybeSingle().then(() => {});
    };

    // Immediate ping on mount
    ping();

    // Ping every 2 minutes
    intervalRef.current = window.setInterval(ping, 2 * 60 * 1000);

    // Ping when tab becomes visible again (user returns to app)
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
