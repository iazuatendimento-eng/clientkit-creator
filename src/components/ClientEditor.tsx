import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, User, CreditCard, QrCode, Calendar, DollarSign, Plus, Trash2, Upload, Download, Eye, X, FileText, FileImage, File, Palette, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createClientUpload, getClientUploads, deleteClientUpload, type ClientUpload } from "@/lib/clientDatabase";

interface Team {
  id: string;
  name: string;
}

interface Client {
  id?: string;
  name: string;
  email: string;
  email_2?: string;
  email_3?: string;
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
  narration_type?: string;
  image_type?: string;
  particularity_type?: string;
  briefing?: string;
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
  const [formData, setFormData] = useState<Partial<Client>>(() => {
    if (client) {
      return {
        ...client,
        email: (client.email || "").trim(),
        email_2: (client.email_2 || "").trim(),
        email_3: (client.email_3 || "").trim(),
        team: (client.team || "").trim(),
      };
    }
    return {
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
      narration_type: "",
      image_type: "",
      particularity_type: "",
      briefing: "",
    };
  });
  const [clientUploads, setClientUploads] = useState<ClientUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  // Client credentials state
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [hasCredentials, setHasCredentials] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Brand kit state
  const [brandColors, setBrandColors] = useState<string[]>(
    client?.brand_kit?.colors || ["#ffffff", "#000000", "#cccccc", "#aaaaaa"]
  );
  const [brandPngs, setBrandPngs] = useState<string[]>(
    client?.brand_kit?.pngs || ["", "", ""]
  );
  const [brandFont, setBrandFont] = useState<string>(
    client?.brand_kit?.font || ""
  );
  const [brandBackgroundPng, setBrandBackgroundPng] = useState<string>(
    client?.brand_kit?.backgroundPng || ""
  );

  useEffect(() => {
    if (client?.brand_kit) {
      setBrandColors(client.brand_kit.colors || ["#ffffff", "#000000", "#cccccc", "#aaaaaa"]);
      setBrandPngs(client.brand_kit.pngs || [
        client.brand_kit.logo || "",
        client.brand_kit.contactInfo || "",
        client.brand_kit.mascot || "",
      ]);
      setBrandFont(client.brand_kit.font || "");
      setBrandBackgroundPng(client.brand_kit.backgroundPng || "");
    }
  }, [client?.brand_kit]);

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (client) {
      console.log("[ClientEditor] Loading client data - team:", JSON.stringify(client.team), "email_2:", JSON.stringify(client.email_2), "email_3:", JSON.stringify(client.email_3));
      setFormData({
        ...client,
        email: (client.email || "").trim(),
        email_2: (client.email_2 || "").trim(),
        email_3: (client.email_3 || "").trim(),
        team: (client.team || "").trim(),
      });
      if (client.id) {
        loadClientUploads(client.id);
        loadCredentials(client.id);
      }
    }
  }, [client]);

  const loadClientUploads = async (clientId: string) => {
    try {
      const uploads = await getClientUploads(clientId);
      setClientUploads(uploads as ClientUpload[]);
    } catch (error) {
      console.error("Error loading client uploads:", error);
    }
  };

  const loadCredentials = async (clientId: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${supabaseUrl}/functions/v1/manage-client-credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "get", client_id: clientId }),
      });
      if (res.ok) {
        const { credentials } = await res.json();
        if (credentials) {
          setCredUsername(credentials.username);
          setHasCredentials(true);
        }
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
  };

  const handleSaveCredentials = async () => {
    if (!client?.id || !credUsername || !credPassword) {
      toast.error("Preencha usuário e senha");
      return;
    }
    setSavingCredentials(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");
      const res = await fetch(`${supabaseUrl}/functions/v1/manage-client-credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "upsert",
          client_id: client.id,
          username: credUsername,
          password: credPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar");
      }
      setHasCredentials(true);
      setCredPassword("");
      toast.success("Credenciais salvas!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar credenciais");
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!client?.id) {
      toast.error("Salve o cliente antes de fazer uploads.");
      return;
    }
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const filePath = `client-files/${client.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("card-uploads")
          .upload(filePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(filePath);

        await createClientUpload({
          client_id: client.id,
          file_url: publicUrl,
          file_name: file.name,
          file_type: file.type,
        });
      }

      await loadClientUploads(client.id);
      toast.success(`${files.length} arquivo(s) enviado(s)!`);
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Erro ao enviar arquivo.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    try {
      await deleteClientUpload(uploadId);
      setClientUploads(prev => prev.filter(u => u.id !== uploadId));
      toast.success("Arquivo removido!");
    } catch (error) {
      console.error("Error deleting upload:", error);
      toast.error("Erro ao remover arquivo.");
    }
  };

  const handleViewUpload = (url: string) => {
    window.open(url, '_blank');
  };

  const handleDownloadUpload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 5000);
    } catch {
      window.open(url, '_blank');
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return <FileImage className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const loadTeams = async () => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("name", { ascending: true });
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
    
    if (!formData.team || formData.team.trim() === "") {
      toast.error("Selecione uma equipe antes de salvar.");
      return;
    }
    
    const brandKit = {
      colors: brandColors,
      pngs: brandPngs,
      font: brandFont || undefined,
      logo: brandPngs[0] || undefined,
      contactInfo: brandPngs[1] || undefined,
      mascot: brandPngs[2] || undefined,
      backgroundPng: brandBackgroundPng || undefined,
    };

    const clientData: Client = {
      id: client?.id,
      name: formData.name || "",
      email: formData.email || "",
      email_2: (formData as any).email_2 || undefined,
      email_3: (formData as any).email_3 || undefined,
      company: formData.company,
      phone: formData.phone,
      notes: formData.notes,
      team: (formData.team || "").trim(),
      brand_kit: brandKit,
      projectCount: client?.projectCount || 0,
      created_at: client?.created_at || new Date().toISOString().split('T')[0],
      payment_method: formData.payment_method,
      payment_due_day: formData.payment_due_day,
      monthly_amount: formData.monthly_amount,
      narration_type: formData.narration_type,
      image_type: formData.image_type,
      particularity_type: formData.particularity_type,
      briefing: formData.briefing,
    };

    onSave(clientData);
  };

  const handleBrandPngUpload = (event: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setBrandPngs(prev => {
          const newPngs = [...prev];
          newPngs[index] = result;
          return newPngs;
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackgroundPngUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Arquivo muito grande. Máximo 5MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setBrandBackgroundPng(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
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
                  <Label htmlFor="email">Email 1 *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="Email principal do cliente"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email_2">Email 2</Label>
                  <Input
                    id="email_2"
                    type="email"
                    value={(formData as any).email_2 || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, email_2: e.target.value }))}
                    placeholder="Segundo email (opcional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email_3">Email 3</Label>
                  <Input
                    id="email_3"
                    type="email"
                    value={(formData as any).email_3 || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, email_3: e.target.value }))}
                    placeholder="Terceiro email (opcional)"
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
                    required
                  >
                    <SelectTrigger className={`flex-1 ${!formData.team?.trim() ? 'border-destructive' : ''}`}>
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

              {/* Payment Section - hidden from UI but data preserved */}

              {/* Tipos de Produção */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="narration_type">Tipo de Narração</Label>
                  <Input
                    id="narration_type"
                    value={formData.narration_type || ""}
                    onChange={(e) => handleChange("narration_type", e.target.value)}
                    placeholder="Ex: Masculina, Feminina, IA..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image_type">Tipo de Imagem</Label>
                  <Input
                    id="image_type"
                    value={formData.image_type || ""}
                    onChange={(e) => handleChange("image_type", e.target.value)}
                    placeholder="Ex: Foto real, Ilustração, IA..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="particularity_type">Particularidade</Label>
                  <Input
                    id="particularity_type"
                    value={formData.particularity_type || ""}
                    onChange={(e) => handleChange("particularity_type", e.target.value)}
                    placeholder="Ex: Foco em promoção, institucional..."
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

              <div className="space-y-2">
                <Label htmlFor="briefing" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Briefing
                </Label>
                <Textarea
                  id="briefing"
                  rows={5}
                  value={formData.briefing || ""}
                  onChange={(e) => handleChange("briefing", e.target.value)}
                  placeholder="Descreva o briefing do cliente (diretrizes, tom de voz, público-alvo, etc.)"
                />
              </div>

              {/* Acesso do Cliente */}
              {client?.id && (
                <div className="space-y-2 pt-4 border-t border-border">
                  <Label className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Acesso do Cliente ao Sistema
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {hasCredentials ? "Este cliente já possui acesso. Altere abaixo se necessário." : "Crie um usuário e senha para o cliente acessar o portal."}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="cred-username" className="text-xs">Usuário</Label>
                      <Input
                        id="cred-username"
                        value={credUsername}
                        onChange={(e) => setCredUsername(e.target.value)}
                        placeholder="usuario.cliente"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cred-password" className="text-xs">
                        {hasCredentials ? "Nova Senha" : "Senha"}
                      </Label>
                      <Input
                        id="cred-password"
                        type="password"
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        placeholder={hasCredentials ? "Deixe vazio para manter" : "••••••••"}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveCredentials}
                    disabled={savingCredentials || !credUsername || (!credPassword && !hasCredentials)}
                  >
                    {savingCredentials ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Salvando...</>
                    ) : (
                      <><Save className="h-3 w-3 mr-1" /> {hasCredentials ? "Atualizar Acesso" : "Criar Acesso"}</>
                    )}
                  </Button>
                </div>
              )}
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
