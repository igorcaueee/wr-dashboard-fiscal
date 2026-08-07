import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, History } from 'lucide-react';
import { formatBRL, formatMesAno, periodoToSort } from '@/lib/format';

export default function HistoricoLucroPresumido() {
  const queryClient = useQueryClient();
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [anoFiltro, setAnoFiltro] = useState('todos');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const empresasFiltradas = empresas.filter((e) => e.regime_tributario === 'lucro_presumido');

  const { data: allApuracoes = [], isLoading } = useQuery({
    queryKey: ['apuracoes-lp', selectedEmpresaId],
    queryFn: () =>
      selectedEmpresaId
        ? base44.entities.ApuracaoLucroPresumido.filter({ empresa_id: selectedEmpresaId }, '-periodo', 200)
        : Promise.resolve([]),
    enabled: !!selectedEmpresaId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ApuracaoLucroPresumido.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apuracoes-lp'] });
      setDeleteTarget(null);
    },
  });

  const anos = useMemo(() => {
    const set = new Set();
    allApuracoes.forEach((a) => {
      if (a.periodo) {
        const ano = a.periodo.split('/')[1];
        if (ano) set.add(ano);
      }
    });
    return Array.from(set).sort().reverse();
  }, [allApuracoes]);

  const filteredApuracoes = useMemo(() => {
    let list = [...allApuracoes].sort((a, b) => periodoToSort(b.periodo) - periodoToSort(a.periodo));
    if (anoFiltro !== 'todos') {
      list = list.filter((a) => a.periodo && a.periodo.endsWith('/' + anoFiltro));
    }
    return list;
  }, [allApuracoes, anoFiltro]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Histórico de Apurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Lucro Presumido — Visualize e gerencie as apurações mensais de SPEDs</p>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Empresa</label>
            <Select value={selectedEmpresaId} onValueChange={setSelectedEmpresaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa..." />
              </SelectTrigger>
              <SelectContent>
                {empresasFiltradas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ano</label>
            <Select value={anoFiltro} onValueChange={setAnoFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {anos.map((ano) => (
                  <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      {!selectedEmpresaId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <History className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa para visualizar o histórico</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-muted rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredApuracoes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <History className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Nenhuma apuração encontrada para este filtro.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Período</TableHead>
                  <TableHead className="font-semibold text-right">Compras</TableHead>
                  <TableHead className="font-semibold text-right">Faturamento</TableHead>
                  <TableHead className="font-semibold text-right">ICMS</TableHead>
                  <TableHead className="font-semibold text-right">PIS</TableHead>
                  <TableHead className="font-semibold text-right">COFINS</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApuracoes.map((a) => {
                  const icmsCredor = (a.icms_saldo || 0) < 0;
                  const pisCredor = (a.pis_saldo || 0) < 0;
                  const cofinsCredor = (a.cofins_saldo || 0) < 0;
                  return (
                    <TableRow key={a.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{formatMesAno(a.periodo)}</TableCell>
                      <TableCell className="text-right">{formatBRL(a.total_compras)}</TableCell>
                      <TableCell className="text-right">{formatBRL(a.total_vendas)}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-semibold">{formatBRL(Math.abs(a.icms_saldo || 0))}</div>
                        <div className="text-xs text-muted-foreground">{icmsCredor ? 'Saldo Credor' : 'Valor a Pagar'}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-semibold">{formatBRL(Math.abs(a.pis_saldo || 0))}</div>
                        <div className="text-xs text-muted-foreground">{pisCredor ? 'Saldo Credor' : 'Valor a Pagar'}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-semibold">{formatBRL(Math.abs(a.cofins_saldo || 0))}</div>
                        <div className="text-xs text-muted-foreground">{cofinsCredor ? 'Saldo Credor' : 'Valor a Pagar'}</div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir apuração</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir a apuração do período <strong>{deleteTarget?.periodo}</strong>?
              Você poderá reenviar os SPEDs na página de Upload para reprocessá-la.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}