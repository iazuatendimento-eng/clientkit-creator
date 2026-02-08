import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, FileDown, DollarSign, CreditCard, QrCode, Filter, Check, X, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth, parseISO, setDate } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Payment {
  id: string;
  client_id: string;
  client_name: string;
  client_company: string;
  client_phone: string;
  amount: number;
  due_date: string;
  payment_method: "pix" | "credit_card" | null;
  paid: boolean;
  paid_at: string | null;
  notes: string | null;
}

const Receivables = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [filterPaid, setFilterPaid] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  
  useEffect(() => {
    loadPayments();
  }, [filterMonth]);

  const loadPayments = async () => {
    try {
      setIsLoading(true);
      const monthStart = startOfMonth(parseISO(filterMonth + "-01"));
      const monthEnd = endOfMonth(parseISO(filterMonth + "-01"));
      
      const { data, error } = await supabase
        .from("client_payments")
        .select(`
          *,
          client_data:client_id (
            name,
            company,
            phone
          )
        `)
        .gte("due_date", format(monthStart, "yyyy-MM-dd"))
        .lte("due_date", format(monthEnd, "yyyy-MM-dd"))
        .order("due_date", { ascending: true });

      if (error) throw error;

      const mappedPayments: Payment[] = (data || []).map((p: any) => ({
        id: p.id,
        client_id: p.client_id,
        client_name: p.client_data?.name || "Cliente desconhecido",
        client_company: p.client_data?.company || "",
        client_phone: p.client_data?.phone || "",
        amount: p.amount,
        due_date: p.due_date,
        payment_method: p.payment_method,
        paid: p.paid,
        paid_at: p.paid_at,
        notes: p.notes,
      }));

      setPayments(mappedPayments);
    } catch (error) {
      console.error("Error loading payments:", error);
      toast({
        title: "Erro ao carregar pagamentos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePaid = async (payment: Payment) => {
    try {
      const newPaid = !payment.paid;
      const { error } = await supabase
        .from("client_payments")
        .update({ 
          paid: newPaid,
          paid_at: newPaid ? new Date().toISOString() : null 
        })
        .eq("id", payment.id);

      if (error) throw error;

      setPayments(prev => prev.map(p => 
        p.id === payment.id 
          ? { ...p, paid: newPaid, paid_at: newPaid ? new Date().toISOString() : null }
          : p
      ));

      toast({
        title: newPaid ? "Marcado como pago!" : "Marcado como não pago",
      });
    } catch (error) {
      console.error("Error updating payment:", error);
      toast({
        title: "Erro ao atualizar pagamento",
        variant: "destructive",
      });
    }
  };

  const generatePaymentsForMonth = async () => {
    try {
      setIsGenerating(true);
      
      // Get all active clients with payment info
      const { data: clients, error: clientError } = await supabase
        .from("client_data")
        .select("id, name, company, payment_method, payment_due_day, monthly_amount")
        .eq("active", true)
        .not("monthly_amount", "is", null);

      if (clientError) throw clientError;
      if (!clients || clients.length === 0) {
        toast({
          title: "Nenhum cliente encontrado",
          description: "Não há clientes ativos com valor mensal configurado.",
          variant: "destructive",
        });
        return;
      }

      const monthDate = parseISO(filterMonth + "-01");
      
      // Check which clients already have payments for this month
      const { data: existingPayments } = await supabase
        .from("client_payments")
        .select("client_id")
        .gte("due_date", format(startOfMonth(monthDate), "yyyy-MM-dd"))
        .lte("due_date", format(endOfMonth(monthDate), "yyyy-MM-dd"));

      const existingClientIds = new Set((existingPayments || []).map(p => p.client_id));

      // Create payments for clients that don't have one yet
      const newPayments = clients
        .filter(c => !existingClientIds.has(c.id) && c.monthly_amount)
        .map(client => {
          const dueDay = client.payment_due_day || 10;
          const maxDay = endOfMonth(monthDate).getDate();
          const actualDueDay = Math.min(dueDay, maxDay);
          const dueDate = setDate(monthDate, actualDueDay);

          return {
            client_id: client.id,
            amount: client.monthly_amount,
            due_date: format(dueDate, "yyyy-MM-dd"),
            payment_method: client.payment_method,
            paid: false,
          };
        });

      if (newPayments.length === 0) {
        toast({
          title: "Pagamentos já gerados",
          description: "Todos os clientes já possuem pagamentos para este mês.",
        });
        return;
      }

      const { error: insertError } = await supabase
        .from("client_payments")
        .insert(newPayments);

      if (insertError) throw insertError;

      toast({
        title: "Pagamentos gerados!",
        description: `${newPayments.length} pagamentos criados para ${format(monthDate, "MMMM yyyy", { locale: ptBR })}.`,
      });

      loadPayments();
    } catch (error) {
      console.error("Error generating payments:", error);
      toast({
        title: "Erro ao gerar pagamentos",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredPayments = payments.filter(p => {
    if (filterPaid !== "all") {
      if (filterPaid === "paid" && !p.paid) return false;
      if (filterPaid === "unpaid" && p.paid) return false;
    }
    if (filterMethod !== "all" && p.payment_method !== filterMethod) return false;
    return true;
  });

  const totalAmount = filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const paidAmount = filteredPayments.filter(p => p.paid).reduce((sum, p) => sum + Number(p.amount), 0);
  const unpaidAmount = filteredPayments.filter(p => !p.paid).reduce((sum, p) => sum + Number(p.amount), 0);

  const handleExport = () => {
    const exportData = filteredPayments.map(p => ({
      Cliente: p.client_name,
      Empresa: p.client_company,
      Valor: p.amount,
      Vencimento: format(parseISO(p.due_date), "dd/MM/yyyy"),
      "Forma de Pagamento": p.payment_method === "pix" ? "PIX" : p.payment_method === "credit_card" ? "Cartão" : "-",
      Status: p.paid ? "Pago" : "Pendente",
      "Data Pagamento": p.paid_at ? format(parseISO(p.paid_at), "dd/MM/yyyy HH:mm") : "-",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Recebimentos");

    // Add totals row
    const totalRow = [
      { Cliente: "TOTAL", Valor: totalAmount },
      { Cliente: "Pago", Valor: paidAmount },
      { Cliente: "Pendente", Valor: unpaidAmount },
    ];
    XLSX.utils.sheet_add_json(ws, totalRow, { skipHeader: true, origin: -1 });

    XLSX.writeFile(wb, `recebimentos_${filterMonth}.xlsx`);
    toast({ title: "Exportado com sucesso!" });
  };

  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy", { locale: ptBR }),
      });
    }
    return options;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold gradient-text">Recebimentos</h1>
              <p className="text-muted-foreground">Gerencie seus recebimentos</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={generatePaymentsForMonth} disabled={isGenerating} className="bg-gradient-primary">
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Gerar Pagamentos
            </Button>
            <Button onClick={handleExport} variant="outline">
              <FileDown className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total do Período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">
                  R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-green-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Recebido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold text-green-500">
                  R$ {paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-orange-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">A Receber</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <X className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold text-orange-500">
                  R$ {unpaidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros:</span>
              </div>
              
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent>
                  {getMonthOptions().map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterPaid} onValueChange={setFilterPaid}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pagos</SelectItem>
                  <SelectItem value="unpaid">Pendentes</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterMethod} onValueChange={setFilterMethod}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Forma de Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credit_card">Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum pagamento encontrado para o período selecionado.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Pago</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id} className={payment.paid ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={payment.paid}
                          onCheckedChange={() => togglePaid(payment)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{payment.client_name}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.client_phone || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.client_company}</TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {Number(payment.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        {format(parseISO(payment.due_date), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        {payment.payment_method === "pix" ? (
                          <Badge variant="outline" className="gap-1">
                            <QrCode className="h-3 w-3" />
                            PIX
                          </Badge>
                        ) : payment.payment_method === "credit_card" ? (
                          <Badge variant="outline" className="gap-1">
                            <CreditCard className="h-3 w-3" />
                            Cartão
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {payment.paid ? (
                          <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
                            Pago
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-orange-500/50 text-orange-500">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Receivables;
