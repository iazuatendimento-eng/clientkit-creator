import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, User, FileText, Trash2, Edit } from "lucide-react";

interface ProjectBrief {
  id: string;
  clientName: string;
  title: string;
  description: string;
  deadline: string;
  status: "todo" | "in-progress" | "review" | "completed";
  brandKitId?: string;
  createdAt: string;
}

interface ProjectBoardProps {
  brandKits: any[];
  onCreateProject: (brief: ProjectBrief, brandKitId: string) => void;
  clientName?: string;
}

const ProjectBoard = ({ brandKits, onCreateProject, clientName }: ProjectBoardProps) => {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([
    {
      id: "1",
      clientName: clientName || "Cliente Exemplo",
      title: "Banner para Black Friday",
      description: "Criar banner promocional para campanha de Black Friday com 50% de desconto em todos os produtos.",
      deadline: "2024-11-25",
      status: "todo" as ProjectBrief["status"],
      brandKitId: brandKits[0]?.id,
      createdAt: "2024-11-01"
    },
    {
      id: "2",
      clientName: clientName || "Cliente Exemplo",
      title: "Cardápio Digital",
      description: "Desenvolver cardápio digital para aplicativo com fotos dos produtos e preços atualizados.",
      deadline: "2024-11-30",
      status: "in-progress" as ProjectBrief["status"],
      brandKitId: brandKits[0]?.id,
      createdAt: "2024-11-05"
    }
  ].filter(brief => brandKits.length > 0));

  const [newBrief, setNewBrief] = useState<Partial<ProjectBrief>>({});
  const [editingBrief, setEditingBrief] = useState<ProjectBrief | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const columns = [
    { id: "todo", title: "Para Fazer", color: "bg-yellow-500/20 border-yellow-500/30" },
    { id: "in-progress", title: "Em Progresso", color: "bg-blue-500/20 border-blue-500/30" },
    { id: "review", title: "Em Revisão", color: "bg-purple-500/20 border-purple-500/30" },
    { id: "completed", title: "Concluído", color: "bg-green-500/20 border-green-500/30" }
  ];

  const handleSaveBrief = () => {
    const brief: ProjectBrief = {
      id: editingBrief?.id || Date.now().toString(),
      clientName: clientName || newBrief.clientName || "",
      title: newBrief.title || "",
      description: newBrief.description || "",
      deadline: newBrief.deadline || "",
      status: newBrief.status || "todo",
      brandKitId: newBrief.brandKitId,
      createdAt: editingBrief?.createdAt || new Date().toISOString().split('T')[0]
    };

    if (editingBrief) {
      setBriefs(briefs.map(b => b.id === editingBrief.id ? brief : b));
    } else {
      setBriefs([...briefs, brief]);
    }

    setNewBrief({});
    setEditingBrief(null);
    setIsDialogOpen(false);
  };

  const handleDeleteBrief = (id: string) => {
    setBriefs(briefs.filter(b => b.id !== id));
  };

  const handleStatusChange = (briefId: string, newStatus: string) => {
    setBriefs(briefs.map(b => 
      b.id === briefId ? { ...b, status: newStatus as ProjectBrief["status"] } : b
    ));
  };

  const handleEditBrief = (brief: ProjectBrief) => {
    setEditingBrief(brief);
    setNewBrief(brief);
    setIsDialogOpen(true);
  };

  const handleCreateProject = (brief: ProjectBrief) => {
    if (brief.brandKitId) {
      onCreateProject(brief, brief.brandKitId);
    }
  };

  const getBrandKit = (brandKitId?: string) => {
    return brandKits.find(bk => bk.id === brandKitId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 p-6">
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">
              {clientName ? `Projetos - ${clientName}` : "Board de Projetos"}
            </h1>
            <p className="text-muted-foreground">
              {clientName 
                ? `Organize os projetos de ${clientName}` 
                : "Organize os briefings e projetos dos seus clientes"
              }
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient" className="glow-effect">
                <Plus className="mr-2 h-4 w-4" />
                Novo Briefing
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingBrief ? "Editar Briefing" : "Novo Briefing"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {!clientName && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Cliente</label>
                    <Input
                      placeholder="Nome do cliente"
                      value={newBrief.clientName || ""}
                      onChange={(e) => setNewBrief({...newBrief, clientName: e.target.value})}
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">Título do Projeto</label>
                  <Input
                    placeholder="Título do projeto"
                    value={newBrief.title || ""}
                    onChange={(e) => setNewBrief({...newBrief, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Descrição</label>
                  <Textarea
                    placeholder="Descreva o que precisa ser feito..."
                    rows={3}
                    value={newBrief.description || ""}
                    onChange={(e) => setNewBrief({...newBrief, description: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Prazo</label>
                  <Input
                    type="date"
                    value={newBrief.deadline || ""}
                    onChange={(e) => setNewBrief({...newBrief, deadline: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Kit de Marca</label>
                  <select
                    className="w-full p-2 border rounded-md bg-background"
                    value={newBrief.brandKitId || ""}
                    onChange={(e) => setNewBrief({...newBrief, brandKitId: e.target.value})}
                  >
                    <option value="">Selecione um kit de marca</option>
                    {brandKits.map(kit => (
                      <option key={kit.id} value={kit.id}>{kit.name}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={handleSaveBrief} className="w-full">
                  {editingBrief ? "Salvar Alterações" : "Criar Briefing"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {columns.map(column => (
            <div key={column.id} className="space-y-4">
              <div className={`p-4 rounded-lg border ${column.color}`}>
                <h3 className="font-semibold text-center">{column.title}</h3>
                <div className="text-center text-sm text-muted-foreground mt-1">
                  {briefs.filter(b => b.status === column.id).length} itens
                </div>
              </div>
              
              <div className="space-y-3">
                {briefs
                  .filter(brief => brief.status === column.id)
                  .map(brief => {
                    const brandKit = getBrandKit(brief.brandKitId);
                    return (
                      <Card key={brief.id} className="bg-gradient-card border-primary/20 hover:border-primary/40 transition-all duration-300">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{brief.clientName}</span>
                              </div>
                              <h4 className="font-semibold text-sm">{brief.title}</h4>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditBrief(brief)}
                                className="h-6 w-6 p-0"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteBrief(brief.id)}
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                            {brief.description}
                          </p>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(brief.deadline).toLocaleDateString('pt-BR')}</span>
                            </div>
                            
                            {brandKit && (
                              <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                  {brandKit.colors.slice(0, 3).map((color: string, index: number) => (
                                    <div
                                      key={index}
                                      className="w-3 h-3 rounded-full border border-white/20"
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                <span className="text-xs text-muted-foreground">{brandKit.name}</span>
                              </div>
                            )}
                            
                            <div className="flex gap-2 pt-2">
                              <select
                                className="text-xs p-1 border rounded bg-background flex-1"
                                value={brief.status}
                                onChange={(e) => handleStatusChange(brief.id, e.target.value)}
                              >
                                {columns.map(col => (
                                  <option key={col.id} value={col.id}>{col.title}</option>
                                ))}
                              </select>
                              
                              {brief.brandKitId && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCreateProject(brief)}
                                  className="text-xs px-2 py-1 h-auto"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Criar Arte
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProjectBoard;