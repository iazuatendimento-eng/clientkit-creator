import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useClientAuth } from "@/hooks/useClientAuth";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [clientUsername, setClientUsername] = useState("");
  const [clientPassword, setClientPassword] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const navigate = useNavigate();
  const { clientLogin, clientSession } = useClientAuth();

  useEffect(() => {
    // Check if admin is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) navigate("/");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (clientSession) {
      navigate("/portal");
    }
  }, [clientSession, navigate]);

  const withTimeout = <T,>(promise: Promise<T>, ms: number) => {
    let t: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      t = window.setTimeout(() => reject(new Error("timeout")), ms);
    });
    return Promise.race([
      promise.finally(() => { if (t) window.clearTimeout(t); }),
      timeout,
    ]) as Promise<T>;
  };

  const checkBackendHealth = async (retries = 3) => {
    if (!navigator.onLine) throw new Error("offline");
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("missing_config");

    for (let attempt = 0; attempt < retries; attempt++) {
      const controller = new AbortController();
      const abortId = window.setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(`${url}/auth/v1/health`, {
          method: "GET",
          headers: { apikey: key },
          signal: controller.signal,
        });
        window.clearTimeout(abortId);
        if (res.ok) return true;
      } catch {
        window.clearTimeout(abortId);
      }
      if (attempt < retries - 1) {
        await new Promise(r => window.setTimeout(r, (attempt + 1) * 2000));
      }
    }
    throw new Error("backend_timeout");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }
    setLoading(true);
    try {
      await checkBackendHealth();
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        12000
      );
      if (error) {
        toast.error(error.message.includes("Invalid login credentials")
          ? "Email ou senha incorretos" : error.message);
        return;
      }
      if (data.session?.user) {
        toast.success("Login realizado com sucesso!");
        navigate("/");
      } else {
        toast.error("Login não foi concluído. Tente novamente.");
      }
    } catch (error: any) {
      const msg = String(error?.message ?? "");
      if (msg === "offline") toast.error("Sem internet.");
      else if (msg === "backend_timeout") toast.error("Servidor indisponível.");
      else if (msg === "timeout") toast.error("Sem resposta do servidor.");
      else toast.error("Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientUsername || !clientPassword) {
      toast.error("Por favor, preencha usuário e senha");
      return;
    }
    setClientLoading(true);
    try {
      const success = await clientLogin(clientUsername, clientPassword);
      if (success) {
        toast.success("Login realizado com sucesso!");
        navigate("/portal");
      } else {
        toast.error("Usuário ou senha incorretos");
      }
    } catch {
      toast.error("Erro ao fazer login");
    } finally {
      setClientLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-background/80 p-4">
      <Card className="w-full max-w-md bg-gradient-card border-primary/20">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <User className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center gradient-text">
            Acesso do Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleClientLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-username">Usuário</Label>
              <Input
                id="client-username"
                type="text"
                placeholder="seu.usuario"
                value={clientUsername}
                onChange={(e) => setClientUsername(e.target.value)}
                disabled={clientLoading}
                className="bg-background/50 border-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-password">Senha</Label>
              <Input
                id="client-password"
                type="password"
                placeholder="••••••••"
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
                disabled={clientLoading}
                className="bg-background/50 border-primary/20"
              />
            </div>
            <Button type="submit" className="w-full" variant="gradient" disabled={clientLoading}>
              {clientLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...</> : <><User className="mr-2 h-4 w-4" /> Entrar</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
