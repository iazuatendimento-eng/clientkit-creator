import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, User, CreditCard, QrCode, Calendar, DollarSign, Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Team {
  id: string;
  name: string;
}

interface Client {
  id?: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  team?: string;
  slug?: string;
  brand_kit?: any;
  projectCount: number;
  created_at: string;
  payment_method?: "pix" | "credit_card";
  payment_due_day?: number;
  monthly_amount?: number;
}

interface ClientEditorProps {
  client?: Client | null;
  onSave: (client: Client) => void;
  onCancel: () => void;
}

export const ClientEditor = ({ client, onSave, onCancel }: ClientEditorProps) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [formData, setFormData] = useState<Partial<Client>>({
    name: "",
    email: "",
    company: "",
    phone: "",
    notes: "",
    team: "",
    projectCount: 0,
    created_at: new Date().toISOString().split('T')[0],
    payment_method: undefined,
    payment_due_day: undefined,
    monthly_amount: undefined,
  });

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (client) {
      setFormData({ ...client });
    }
  }, [client]);

  const loadTeams = async () => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data) setTeams(data);
  };

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) return;
    const { data, error } = await supabase
      .from("teams")
      .insert([{ name: newTeamName.trim() }])
      .select()
      .single();
    if (!error && data) {
      setTeams(prev => [...prev, data]);
      setFormData(prev => ({ ...prev, team: data.name }));
      setNewTeamName("");
      setShowNewTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (!error) {
      setTeams(prev => prev.filter(t => t.id !== teamId));
      if (formData.team === teamName) {
        setFormData(prev => ({ ...prev, team: "" }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const clientData: Client = {
      id: client?.id,
      name: formData.name || "",
      email: formData.email || "",
      company: formData.company,
      phone: formData.phone,
      notes: formData.notes,
      team: formData.team || "",
      brand_kit: formData.brand_kit,
      projectCount: client?.projectCount || 0,
      created_at: client?.created_at || new Date().toISOString().split('T')[0],
      payment_method: formData.payment_method,
      payment_due_day: formData.payment_due_day,
      monthly_amount: formData.monthly_amount,
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
      <div className="container mx-auto max-w-3xl">
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações Básicas */}
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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
                <div className="flex gap-2">
                  <Select
                    value={formData.team || ""}
                    onValueChange={(value) => handleChange("team", value)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione uma equipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.name}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{team.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewTeam(!showNewTeam)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {showNewTeam && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Nome da nova equipe"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTeam())}
                    />
                    <Button type="button" size="sm" onClick={handleAddTeam}>
                      Adicionar
                    </Button>
                  </div>
                )}
                {teams.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {teams.map((team) => (
                      <span
                        key={team.id}
                        className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
                      >
                        {team.name}
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(team.id, team.name)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="payment_method" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Forma de Pagamento
                  </Label>
                  <Select
                    value={formData.payment_method || ""}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method: value as "pix" | "credit_card" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">
                        <div className="flex items-center gap-2">
                          <QrCode className="h-4 w-4" />
                          PIX
                        </div>
                      </SelectItem>
                      <SelectItem value="credit_card">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          Cartão de Crédito
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_due_day" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Dia de Vencimento
                  </Label>
                  <Select
                    value={formData.payment_due_day?.toString() || ""}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, payment_due_day: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Dia" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <SelectItem key={day} value={day.toString()}>
                          Dia {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monthly_amount" className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Valor Mensal (R$)
                  </Label>
                  <Input
                    id="monthly_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.monthly_amount || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, monthly_amount: parseFloat(e.target.value) || undefined }))}
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={formData.notes || ""}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder="Adicione observações sobre o cliente (opcional)"
                />
              </div>
            </CardContent>
          </Card>



          {/* Botões */}
          <div className="flex gap-4">
            <Button type="submit" variant="gradient" className="flex-1 glow-effect">
              <Save className="mr-2 h-4 w-4" />
              {client ? "Salvar Alterações" : "Criar Cliente"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
