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
  const [clientUsername, setClientUsername] = useState("");
  const [clientPassword, setClientPassword] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const navigate = useNavigate();
  const { clientLogin, clientSession } = useClientAuth();

  useEffect(() => {
    if (clientSession) {
      navigate("/portal");
    }
  }, [clientSession, navigate]);




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
