import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, Image, Edit3, Trash2 } from "lucide-react";

interface BrandKit {
  id: string;
  name: string;
  logo?: string;
  colors: string[];
  createdAt: string;
  projectCount: number;
}

interface BrandKitCardProps {
  brandKit: BrandKit;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

export function BrandKitCard({ brandKit, onEdit, onDelete, onSelect }: BrandKitCardProps) {
  return (
    <Card className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl bg-gradient-card border-primary/20 hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold gradient-text">{brandKit.name}</CardTitle>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(brandKit.id);
              }}
              className="h-8 w-8 p-0 hover:bg-primary/10"
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(brandKit.id);
              }}
              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent onClick={() => onSelect(brandKit.id)} className="space-y-4">
        {/* Logo Preview */}
        <div className="flex items-center justify-center h-20 bg-muted/30 rounded-lg border border-primary/10">
          {brandKit.logo ? (
            <img src={brandKit.logo} alt="Logo" className="h-16 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Image className="h-6 w-6" />
              <span className="text-sm">Sem logo</span>
            </div>
          )}
        </div>

        {/* Color Palette */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Palette className="h-4 w-4" />
            <span>Paleta de Cores</span>
          </div>
          <div className="flex gap-1">
            {brandKit.colors.length > 0 ? (
              brandKit.colors.slice(0, 6).map((color, index) => (
                <div
                  key={index}
                  className="w-8 h-8 rounded-full border-2 border-primary/20 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              ))
            ) : (
              <div className="text-xs text-muted-foreground">Nenhuma cor definida</div>
            )}
            {brandKit.colors.length > 6 && (
              <div className="w-8 h-8 rounded-full border-2 border-primary/20 bg-muted/30 flex items-center justify-center text-xs">
                +{brandKit.colors.length - 6}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between pt-2 border-t border-primary/10">
          <Badge variant="secondary" className="text-xs">
            {brandKit.projectCount} projetos
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(brandKit.createdAt).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}