import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, User, CreditCard, QrCode, Calendar, DollarSign, Plus, Trash2, Upload, Download, Eye, X, FileText, FileImage, File, Palette } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createClientUpload, getClientUploads, deleteClientUpload, type ClientUpload } from "@/lib/clientDatabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    narration_type: "",
    image_type: "",
    particularity_type: "",
    briefing: "",
  });
  const [clientUploads, setClientUploads] = useState<ClientUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);

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

  useEffect(() => {
    if (client?.brand_kit) {
      setBrandColors(client.brand_kit.colors || ["#ffffff", "#000000", "#cccccc", "#aaaaaa"]);
      setBrandPngs(client.brand_kit.pngs || [
        client.brand_kit.logo || "",
        client.brand_kit.contactInfo || "",
        client.brand_kit.mascot || "",
      ]);
      setBrandFont(client.brand_kit.font || "");
    }
  }, [client?.brand_kit]);

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (client) {
      setFormData({ ...client });
      if (client.id) {
        loadClientUploads(client.id);
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
          .upload(filePath, file);

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
    };

    const clientData: Client = {
      id: client?.id,
      name: formData.name || "",
      email: formData.email || "",
      company: formData.company,
      phone: formData.phone,
      notes: formData.notes,
      team: formData.team || "",
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
            </CardContent>
          </Card>

          {/* Brand Kit Section */}
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Kit de Marca
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Colors */}
              <div className="space-y-3">
                <Label>Paleta de Cores</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {["Fundo", "Texto", "Acessório 1", "Acessório 2"].map((label, i) => (
                    <div key={i} className="space-y-1">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={brandColors[i] || "#000000"}
                          onChange={(e) => {
                            const newColors = [...brandColors];
                            newColors[i] = e.target.value;
                            setBrandColors(newColors);
                          }}
                          className="w-10 h-10 rounded border border-primary/20 cursor-pointer"
                        />
                        <Input
                          value={brandColors[i] || ""}
                          onChange={(e) => {
                            const newColors = [...brandColors];
                            newColors[i] = e.target.value;
                            setBrandColors(newColors);
                          }}
                          className="flex-1 text-xs"
                          placeholder="#000000"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Font */}
              <div className="space-y-3">
                <Label>Fonte</Label>
                <Select
                  value={brandFont || ""}
                  onValueChange={(value) => setBrandFont(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma fonte" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Arial", "Arial Black", "Bebas Neue", "Calibri", "Cambria",
                      "Comic Sans MS", "Courier New", "Dancing Script", "Franklin Gothic",
                      "Futura", "Georgia", "Gill Sans", "Gotham", "Helvetica",
                      "Impact", "Inter", "Lato", "Lobster", "Lucida Console",
                      "Merriweather", "Montserrat", "Nunito", "Open Sans", "Oswald",
                      "Pacifico", "Palatino", "Playfair Display", "Poppins", "PT Sans",
                      "Quicksand", "Raleway", "Roboto", "Roboto Condensed", "Roboto Slab",
                      "Segoe UI", "Source Sans Pro", "Tahoma", "Times New Roman",
                      "Trebuchet MS", "Ubuntu", "Verdana", "Work Sans"
                    ].map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {brandFont && (
                  <p className="text-xs text-muted-foreground">
                    Fonte selecionada: <span className="font-semibold">{brandFont}</span>
                  </p>
                )}
              </div>

              {/* PNGs */}
              <div className="space-y-3">
                <Label>Imagens (PNGs)</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "Logomarca", index: 0 },
                    { label: "Dados de Contato", index: 1 },
                    { label: "Mascote", index: 2 },
                  ].map(({ label, index }) => (
                    <div key={index} className="space-y-2">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <div className="flex items-center justify-center h-24 bg-background/50 rounded-lg border-2 border-dashed border-primary/30 overflow-hidden">
                        {brandPngs[index] ? (
                          <div className="relative w-full h-full flex items-center justify-center">
                            <img src={brandPngs[index]} alt={label} className="h-20 w-auto object-contain" />
                            <button
                              type="button"
                              onClick={() => {
                                const newPngs = [...brandPngs];
                                newPngs[index] = "";
                                setBrandPngs(newPngs);
                              }}
                              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Upload className="h-4 w-4 mx-auto text-muted-foreground" />
                            <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleBrandPngUpload(e, index)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Button type="button" variant="outline" size="sm" className="w-full text-xs">
                          <Upload className="h-3 w-3 mr-1" />
                          {brandPngs[index] ? "Alterar" : "Upload"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {client?.id && (
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Uploads do Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button type="button" asChild variant="outline" className="w-full" disabled={isUploading}>
                  <label className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    {isUploading ? "Enviando..." : "Adicionar Arquivos"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </Button>

                {clientUploads.length > 0 ? (
                  <div className="space-y-2">
                    {clientUploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {getFileIcon(upload.file_type)}
                          <span className="text-sm truncate">{upload.file_name}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewUpload(upload.file_url)}
                            title="Ver"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDownloadUpload(upload.file_url, upload.file_name)}
                            title="Baixar"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteUpload(upload.id)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum arquivo enviado ainda.
                  </p>
                )}
              </CardContent>
            </Card>
          )}



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
