import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface ClientSession {
  id: string;
  name: string;
  email: string;
  company?: string;
  slug: string;
  team?: string;
  active?: boolean;
}

interface ClientAuthContextType {
  clientSession: ClientSession | null;
  clientLoading: boolean;
  clientLogin: (username: string, password: string) => Promise<boolean>;
  clientLogout: () => void;
}

const ClientAuthContext = createContext<ClientAuthContextType>({
  clientSession: null,
  clientLoading: true,
  clientLogin: async () => false,
  clientLogout: () => {},
});

export const useClientAuth = () => useContext(ClientAuthContext);

const STORAGE_KEY = "client_session";

export const ClientAuthProvider = ({ children }: { children: ReactNode }) => {
  const [clientSession, setClientSession] = useState<ClientSession | null>(null);
  const [clientLoading, setClientLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setClientSession(JSON.parse(stored));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setClientLoading(false);
  }, []);

  const clientLogin = async (username: string, password: string): Promise<boolean> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/manage-client-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
      });

      if (!res.ok) return false;

      const { client } = await res.json();
      if (!client) return false;

      setClientSession(client);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(client));
      return true;
    } catch (error) {
      console.error("Client login error:", error);
      return false;
    }
  };

  const clientLogout = () => {
    setClientSession(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ClientAuthContext.Provider value={{ clientSession, clientLoading, clientLogin, clientLogout }}>
      {children}
    </ClientAuthContext.Provider>
  );
};
