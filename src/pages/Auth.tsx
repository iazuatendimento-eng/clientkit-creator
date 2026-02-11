import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const withTimeout = <T,>(promise: Promise<T>, ms: number) => {
    let t: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      t = window.setTimeout(() => reject(new Error("timeout")), ms);
    });

    return Promise.race([
      promise.finally(() => {
        if (t) window.clearTimeout(t);
      }),
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
        // Non-OK: retry after delay
      } catch {
        window.clearTimeout(abortId);
        // Network/timeout error: retry after delay
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
      console.info("auth: login start");

      await checkBackendHealth();

      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        12000
      );

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Email ou senha incorretos");
        } else {
          toast.error(error.message);
        }
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
      if (msg === "offline") {
        toast.error("Sem internet. Conecte-se e tente novamente.");
      } else if (msg === "backend_timeout" || msg.startsWith("backend_http_")) {
        toast.error("Servidor indisponível no momento. Tente novamente em instantes.");
      } else if (msg === "missing_config") {
        toast.error("Configuração do login está incompleta.");
      } else if (msg === "timeout") {
        toast.error("Sem resposta do servidor. Verifique sua conexão e tente novamente.");
      } else {
        toast.error("Erro ao fazer login");
      }
      console.error("Login error:", error);
    } finally {
      console.info("auth: login end");
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      console.info("auth: signup start");

      const redirectUrl = `${window.location.origin}/`;

      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              email: email,
            },
          },
        }),
        15000
      );

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error("Este email já está cadastrado");
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.session?.user) {
        toast.success("Conta criada com sucesso!");
        navigate("/");
      } else {
        toast.success("Conta criada! Agora você já pode entrar.");
      }
    } catch (error: any) {
      if (error?.message === "timeout") {
        toast.error("Sem resposta do servidor. Verifique sua conexão e tente novamente.");
      } else {
        toast.error("Erro ao criar conta");
      }
      console.error("Signup error:", error);
    } finally {
      console.info("auth: signup end");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-background/80 p-4">
      <Card className="w-full max-w-md bg-gradient-card border-primary/20">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <LogIn className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-left gradient-text">
            Acesso Master
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="bg-background/50 border-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="bg-background/50 border-primary/20"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              variant="gradient"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}
