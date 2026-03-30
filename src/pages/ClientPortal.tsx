import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useClientAuth } from "@/hooks/useClientAuth";
import { QuickCreate } from "@/components/QuickCreate";
import { Button } from "@/components/ui/button";
import { LogOut, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getClientWithBrandKit } from "@/lib/clientDatabase";

const ClientPortal = () => {
  const { clientSession, clientLogout } = useClientAuth();
  const navigate = useNavigate();
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [brandKit, setBrandKit] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientSession) {
      navigate("/auth");
      return;
    }
    loadBrandKit();
  }, [clientSession]);

  const loadBrandKit = async () => {
    if (!clientSession) return;
    try {
      const data = await getClientWithBrandKit(clientSession.id);
      if (data?.brand_kit) {
        setBrandKit(data.brand_kit);
      }
    } catch (error) {
      console.error("Error loading brand kit:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!clientSession) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {clientSession.company || clientSession.name}
            </h1>
            <p className="text-sm text-muted-foreground">{clientSession.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="gradient"
              onClick={() => setIsQuickCreateOpen(true)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Criação Rápida
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clientLogout();
                navigate("/auth");
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Bem-vindo, {clientSession.company || clientSession.name}!
          </h2>
          <p className="text-muted-foreground mb-8">
            Use o botão "Criação Rápida" para solicitar novos materiais.
          </p>
          <Button
            variant="gradient"
            size="lg"
            onClick={() => setIsQuickCreateOpen(true)}
          >
            <Sparkles className="h-5 w-5 mr-2" />
            Criação Rápida
          </Button>
        </div>
      </div>

      {/* Quick Create */}
      {isQuickCreateOpen && (
        <QuickCreate
          clientId={clientSession.id}
          clientName={clientSession.company || clientSession.name}
          brandKit={brandKit}
          isClientPortal
        />
      )}
    </div>
  );
};

export default ClientPortal;
