import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Plus, X, Save, ArrowLeft } from "lucide-react";

interface BrandKitEditorProps {
  brandKit?: {
    id: string;
    name: string;
    logo?: string;
    contactInfo?: string;
    mascot?: string;
    colors: string[];
    createdAt?: string;
    projectCount?: number;
  };
  onSave: (brandKit: any) => void;
  onCancel: () => void;
}

export function BrandKitEditor({ brandKit, onSave, onCancel }: BrandKitEditorProps) {
  const [name, setName] = useState(brandKit?.name || "");
  const [logo, setLogo] = useState(brandKit?.logo || "");
  const [contactInfo, setContactInfo] = useState(brandKit?.contactInfo || "");
  const [mascot, setMascot] = useState(brandKit?.mascot || "");
  const [colors, setColors] = useState(brandKit?.colors || ["#8B5CF6", "#EC4899", "#F59E0B"]);
  const [newColor, setNewColor] = useState("#8B5CF6");

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'contact' | 'mascot') => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (type === 'logo') setLogo(result);
        else if (type === 'contact') setContactInfo(result);
        else if (type === 'mascot') setMascot(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const addColor = () => {
    if (newColor && !colors.includes(newColor)) {
      setColors([...colors, newColor]);
    }
  };

  const removeColor = (index: number) => {
    setColors(colors.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      id: brandKit?.id || Date.now().toString(),
      name,
      logo,
      contactInfo,
      mascot,
      colors,
      createdAt: brandKit?.id ? brandKit.createdAt : new Date().toISOString(),
      projectCount: brandKit?.projectCount || 0,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onCancel} className="p-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold gradient-text">
            {brandKit ? "Editar Kit de Marca" : "Criar Kit de Marca"}
          </h2>
          <p className="text-muted-foreground">
            Configure o nome, logo e paleta de cores para seu cliente
          </p>
        </div>
      </div>

      <Tabs defaultValue="basic" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Básico</TabsTrigger>
          <TabsTrigger value="images">Imagens</TabsTrigger>
          <TabsTrigger value="colors">Cores</TabsTrigger>
        </TabsList>

        {/* Basic Info */}
        <TabsContent value="basic">
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Kit de Marca</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Empresa ABC"
                  className="bg-background/50 border-primary/20"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Images Upload */}
        <TabsContent value="images">
          <div className="grid gap-4">
            {/* Logo */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Logomarca</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center h-32 bg-background/50 rounded-lg border-2 border-dashed border-primary/30">
                  {logo ? (
                    <div className="relative">
                      <img src={logo} alt="Logo" className="h-24 w-auto object-contain" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogo("")}
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Upload da Logomarca</p>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'logo')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button variant="outline" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    {logo ? "Alterar" : "Upload"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Dados de Contato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center h-32 bg-background/50 rounded-lg border-2 border-dashed border-primary/30">
                  {contactInfo ? (
                    <div className="relative">
                      <img src={contactInfo} alt="Contato" className="h-24 w-auto object-contain" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setContactInfo("")}
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Upload dos Dados de Contato</p>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'contact')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button variant="outline" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    {contactInfo ? "Alterar" : "Upload"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Mascot */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Mascote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center h-32 bg-background/50 rounded-lg border-2 border-dashed border-primary/30">
                  {mascot ? (
                    <div className="relative">
                      <img src={mascot} alt="Mascote" className="h-24 w-auto object-contain" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMascot("")}
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Upload do Mascote</p>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'mascot')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button variant="outline" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    {mascot ? "Alterar" : "Upload"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Color Palette */}
        <TabsContent value="colors">
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle>Paleta de Cores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Colors */}
              <div className="space-y-4">
                <Label>Cores Definidas</Label>
                <div className="grid grid-cols-4 gap-3">
                  {colors.map((color, index) => (
                    <div key={index} className="relative group">
                      <div
                        className="w-full h-16 rounded-lg border-2 border-primary/20 cursor-pointer"
                        style={{ backgroundColor: color }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeColor(index)}
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <div className="text-xs text-center mt-1 text-muted-foreground">
                        {color.toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Color */}
              <div className="space-y-3">
                <Label>Adicionar Nova Cor</Label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-12 h-10 rounded border border-primary/20 cursor-pointer"
                    />
                    <Input
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      placeholder="#8B5CF6"
                      className="flex-1 bg-background/50 border-primary/20"
                    />
                  </div>
                  <Button onClick={addColor} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          variant="gradient" 
          className="min-w-32"
          disabled={!name.trim()}
        >
          <Save className="h-4 w-4 mr-2" />
          Salvar Kit
        </Button>
      </div>
    </div>
  );
}