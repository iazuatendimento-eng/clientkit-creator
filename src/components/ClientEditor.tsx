import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, User } from "lucide-react";

interface Client {
  id?: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  team?: "1" | "2" | "3";
  slug?: string;
  brand_kit?: any;
  projectCount: number;
  created_at: string;
}

interface ClientEditorProps {
  client?: Client | null;
  onSave: (client: Client) => void;
  onCancel: () => void;
}

export const ClientEditor = ({ client, onSave, onCancel }: ClientEditorProps) => {
  const [formData, setFormData] = useState<Partial<Client>>({
    name: "",
    email: "",
    company: "",
    phone: "",
    notes: "",
    team: "1",
    projectCount: 0,
    created_at: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (client) {
      setFormData(client);
    }
  }, [client]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const clientData: Client = {
      id: client?.id,
      name: formData.name || "",
      email: formData.email || "",
      company: formData.company,
      phone: formData.phone,
      notes: formData.notes,
      team: formData.team || "1",
      brandKit: client?.brandKit,
      projectCount: client?.projectCount || 0,
      createdAt: client?.createdAt || new Date().toISOString().split('T')[0]
    };

    onSave(clientData);
  };

  const handleChange = (field: keyof Client, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 p-6">
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" onClick={onCancel}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold gradient-text">
              {client ? "Editar Cliente" : "Novo Cliente"}
            </h1>
            <p className="text-muted-foreground">
              {client ? "Atualize as informações do cliente" : "Adicione um novo cliente ao sistema"}
            </p>
          </div>
        </div>

        <Card className="bg-gradient-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    value={formData.name || ""}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Digite o nome do cliente"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="Digite o email do cliente"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Empresa</Label>
                  <Input
                    id="company"
                    value={formData.company || ""}
                    onChange={(e) => handleChange("company", e.target.value)}
                    placeholder="Nome da empresa (opcional)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone || ""}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="Telefone de contato (opcional)"
                  />
                </div>
              </div>

                <div className="space-y-2">
                  <Label htmlFor="team">Equipe *</Label>
                  <select
                    id="team"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={formData.team || "1"}
                    onChange={(e) => handleChange("team", e.target.value)}
                    required
                  >
                    <option value="1">SEG, QUA E SEX</option>
                    <option value="2">TER, QUI E SÁB</option>
                    <option value="3">SEG A SEX</option>
                  </select>
                </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={formData.notes || ""}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder="Adicione observações sobre o cliente (opcional)"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" variant="gradient" className="flex-1 glow-effect">
                  <Save className="mr-2 h-4 w-4" />
                  {client ? "Salvar Alterações" : "Criar Cliente"}
                </Button>
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};