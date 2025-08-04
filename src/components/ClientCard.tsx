import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Eye, User, Palette, Calendar } from "lucide-react";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  brandKit?: {
    id: string;
    name: string;
    logo: string;
    colors: string[];
    createdAt: string;
  };
  projectCount: number;
  createdAt: string;
}

interface ClientCardProps {
  client: Client;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

export const ClientCard = ({ client, onEdit, onDelete, onSelect }: ClientCardProps) => {
  return (
    <Card className="bg-gradient-card border-primary/20 hover:border-primary/40 transition-all duration-300 glow-effect-subtle">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-lg">{client.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{client.email}</p>
            {client.company && (
              <Badge variant="secondary" className="text-xs">
                {client.company}
              </Badge>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(client.id)}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(client.id)}
              className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Brand Kit Preview */}
        {client.brandKit ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Palette className="h-3 w-3 text-secondary" />
              <span className="text-sm font-medium">Kit de Marca</span>
            </div>
            <div className="p-3 border rounded-lg bg-background/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{client.brandKit.name}</span>
              </div>
              <div className="flex gap-1">
                {client.brandKit.colors.map((color, index) => (
                  <div
                    key={index}
                    className="w-6 h-6 rounded border border-white/20"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 border border-dashed border-muted-foreground/30 rounded-lg text-center">
            <Palette className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum kit de marca criado
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Desde {new Date(client.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {client.projectCount} projetos
          </Badge>
        </div>

        {/* Actions */}
        <Button
          variant="gradient"
          onClick={() => onSelect(client.id)}
          className="w-full glow-effect"
        >
          <Eye className="mr-2 h-4 w-4" />
          Abrir Dashboard
        </Button>
      </CardContent>
    </Card>
  );
};