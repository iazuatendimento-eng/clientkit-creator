import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, User, Palette, Image, Upload, X } from "lucide-react";

interface BrandKit {
  logo?: string;
  contactInfo?: string;
  mascot?: string;
  colors: string[];
}

interface Client {
  id?: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  team?: "1" | "2" | "3";
  slug?: string;
  brand_kit?: BrandKit;
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
    created_at: new Date().toISOString().split('T')[0],
    brand_kit: {
      colors: ["#FFFFFF", "#000000", "#3B82F6", "#10B981"]
    }
  });

  const logoInputRef = useRef<HTMLInputElement>(null);
  const contactInputRef = useRef<HTMLInputElement>(null);
  const mascotInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (client) {
      setFormData({
        ...client,
        brand_kit: client.brand_kit || {
          colors: ["#FFFFFF", "#000000", "#3B82F6", "#10B981"]
        }
      });
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
      brand_kit: formData.brand_kit,
      projectCount: client?.projectCount || 0,
      created_at: client?.created_at || new Date().toISOString().split('T')[0]
    };

    onSave(clientData);
  };

  const handleChange = (field: keyof Client, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleImageUpload = (field: 'logo' | 'contactInfo' | 'mascot', file: File) => {
    if (!file.type.includes('png')) {
      alert('Por favor, selecione apenas arquivos PNG');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setFormData(prev => ({
        ...prev,
        brand_kit: {
          ...prev.brand_kit,
          colors: prev.brand_kit?.colors || ["#FFFFFF", "#000000", "#3B82F6", "#10B981"],
          [field]: base64
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = (field: 'logo' | 'contactInfo' | 'mascot') => {
    setFormData(prev => ({
      ...prev,
      brand_kit: {
        ...prev.brand_kit,
        colors: prev.brand_kit?.colors || ["#FFFFFF", "#000000", "#3B82F6", "#10B981"],
        [field]: undefined
      }
    }));
  };

  const handleColorChange = (index: number, color: string) => {
    setFormData(prev => {
      const currentColors = prev.brand_kit?.colors || ["#FFFFFF", "#000000", "#3B82F6", "#10B981"];
      const newColors = [...currentColors];
      newColors[index] = color;
      return {
        ...prev,
        brand_kit: {
          ...prev.brand_kit,
          colors: newColors
        }
      };
    });
  };

  const colorLabels = [
    "Cor de Fundo",
    "Cor da Fonte",
    "Cor Acessório 1",
    "Cor Acessório 2"
  ];

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
                  rows={3}
                  value={formData.notes || ""}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder="Adicione observações sobre o cliente (opcional)"
                />
              </div>
            </CardContent>
          </Card>

          {/* Kit de Marca - Imagens */}
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Kit de Marca - Imagens (PNG)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Logo */}
                <div className="space-y-2">
                  <Label>Logomarca</Label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".png"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload('logo', e.target.files[0])}
                  />
                  {formData.brand_kit?.logo ? (
                    <div className="relative group">
                      <img
                        src={formData.brand_kit.logo}
                        alt="Logo"
                        className="w-full h-32 object-contain border rounded-lg bg-muted"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage('logo')}
                        className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Enviar Logo</span>
                    </button>
                  )}
                </div>

                {/* Dados de Contato */}
                <div className="space-y-2">
                  <Label>Dados de Contato</Label>
                  <input
                    ref={contactInputRef}
                    type="file"
                    accept=".png"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload('contactInfo', e.target.files[0])}
                  />
                  {formData.brand_kit?.contactInfo ? (
                    <div className="relative group">
                      <img
                        src={formData.brand_kit.contactInfo}
                        alt="Contato"
                        className="w-full h-32 object-contain border rounded-lg bg-muted"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage('contactInfo')}
                        className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => contactInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Enviar Contato</span>
                    </button>
                  )}
                </div>

                {/* Mascote */}
                <div className="space-y-2">
                  <Label>Mascote/Elemento</Label>
                  <input
                    ref={mascotInputRef}
                    type="file"
                    accept=".png"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload('mascot', e.target.files[0])}
                  />
                  {formData.brand_kit?.mascot ? (
                    <div className="relative group">
                      <img
                        src={formData.brand_kit.mascot}
                        alt="Mascote"
                        className="w-full h-32 object-contain border rounded-lg bg-muted"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage('mascot')}
                        className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => mascotInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Enviar Mascote</span>
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kit de Marca - Cores */}
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Kit de Marca - Cores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {colorLabels.map((label, index) => (
                  <div key={index} className="space-y-2">
                    <Label>{label}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formData.brand_kit?.colors?.[index] || "#FFFFFF"}
                        onChange={(e) => handleColorChange(index, e.target.value)}
                        className="w-12 h-10 rounded cursor-pointer border"
                      />
                      <Input
                        value={formData.brand_kit?.colors?.[index] || "#FFFFFF"}
                        onChange={(e) => handleColorChange(index, e.target.value)}
                        className="flex-1 font-mono text-sm"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
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
