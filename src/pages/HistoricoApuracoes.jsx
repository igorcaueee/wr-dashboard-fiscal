import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Trash2, History, ChevronDown } from 'lucide-react';
import { formatBRL, formatPercent, formatMesAno, periodoToSort } from '@/lib/format';

export default function HistoricoApuracoes() {
  const queryClient = useQueryClient();
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [anoFiltro, setAnoFiltro] = useState('todos');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const empresasFiltradas = empresas.filter((e) => !e.regime_tributario || e.regime_tributario === 'simples_nacional');

  const { data: allApuracoes = [], isLoading } = useQuery({
    queryKey: ['apuracoes', selectedEmpresaId],
    queryFn: () =>
      selectedEmpresaId
        ? base44.entities.Apuracao.filter({ empresa_id: selectedEmpresaId }, '-periodo', 200)
        : Promise.resolve([]),
    enabled: !!selectedEmpresaId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Apuracao.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apuracoes'] });
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

  const empresa = empresas.find((e) => e.id === selectedEmpresaId);

  const tipoEmpresa = empresa?.tipo_empresa || 'somente_servico';

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Histórico de Apurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Simples Nacional — Visualize e gerencie as apurações mensais</p>
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
                  <TableHead className="font-semibold text-right">Receita Bruta</TableHead>
                  {tipoEmpresa !== 'somente_servico' && (
                    <TableHead className="font-semibold text-right">Entradas</TableHead>
                  )}
                  {tipoEmpresa !== 'somente_servico' && (
                    <TableHead className="font-semibold text-right">Saídas</TableHead>
                  )}
                  {tipoEmpresa !== 'entradas_saidas' && (
                    <TableHead className="font-semibold text-right">Serviços</TableHead>
                  )}
                  <TableHead className="font-semibold text-right">Simples Nacional</TableHead>
                  <TableHead className="font-semibold text-right">Alíquota</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApuracoes.map((a) => (
                  <TableRow key={a.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{formatMesAno(a.periodo)}</TableCell>
                    <TableCell className="text-right">{formatBRL(a.receita_bruta_periodo)}</TableCell>
                    {tipoEmpresa !== 'somente_servico' && (
                      <TableCell className="text-right">{formatBRL(a.total_entradas)}</TableCell>
                    )}
                    {tipoEmpresa !== 'somente_servico' && (
                      <TableCell className="text-right">
                        {formatBRL((a.total_saidas_sem_st || 0) + (a.total_saidas_st || 0))}
                      </TableCell>
                    )}
                    {tipoEmpresa !== 'entradas_saidas' && (
                      <TableCell className="text-right">{formatBRL(a.total_servicos)}</TableCell>
                    )}
                    <TableCell className="text-right font-semibold">{formatBRL(a.simples_nacional_total)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{formatPercent(a.aliquota_efetiva)}</Badge>
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
                ))}
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
              Esta ação não pode ser desfeita.
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