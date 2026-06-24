import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Building2, Plus, Pencil, Trash2 } from 'lucide-react';
import { formatCNPJ, formatDateBR } from '@/lib/format';
import { cn } from '@/lib/utils';

const tipoLabels = {
  somente_servico: 'Somente Serviços',
  entradas_saidas: 'Entradas e Saídas',
  entradas_saidas_servicos: 'Entradas, Saídas e Serviços',
};

const tipoColors = {
  somente_servico: 'bg-blue-50 text-blue-700 border-blue-200',
  entradas_saidas: 'bg-teal-50 text-teal-700 border-teal-200',
  entradas_saidas_servicos: 'bg-purple-50 text-purple-700 border-purple-200',
};

const initialForm = {
  nome: '',
  cnpj: '',
  inicio_atividades: '',
  tipo_empresa: 'somente_servico',
  regime_tributario: 'simples_nacional',
};

export default function Empresas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(initialForm);

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Empresa.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      setDialogOpen(false);
      setForm(initialForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Empresa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(initialForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Empresa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      queryClient.invalidateQueries({ queryKey: ['apuracoes'] });
      setDeleteTarget(null);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome || !form.cnpj) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const openEdit = (emp) => {
    setEditingId(emp.id);
    setForm({
      nome: emp.nome || '',
      cnpj: emp.cnpj || '',
      inicio_atividades: emp.inicio_atividades || '',
      tipo_empresa: emp.tipo_empresa || 'somente_servico',
      regime_tributario: emp.regime_tributario || 'simples_nacional',
    });
    setDialogOpen(true);
  };

  const handleDelete = () => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleCNPJChange = (e) => {
    let value = e.target.value.replace(/\D/g, '').slice(0, 14);
    if (value.length > 2) value = value.slice(0, 2) + '.' + value.slice(2);
    if (value.length > 6) value = value.slice(0, 6) + '.' + value.slice(6);
    if (value.length > 10) value = value.slice(0, 10) + '/' + value.slice(10);
    if (value.length > 15) value = value.slice(0, 15) + '-' + value.slice(15);
    setForm({ ...form, cnpj: value });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie as empresas cadastradas no sistema
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Nova Empresa
        </Button>
      </div>

      {/* Listagem */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-5 bg-muted rounded w-48 mb-3" />
                <div className="h-4 bg-muted rounded w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : empresas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              Nenhuma empresa cadastrada
            </h3>
            <p className="text-sm text-muted-foreground/70 mb-4">
              Cadastre a primeira empresa para começar
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> Cadastrar primeira empresa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {empresas.map((emp) => (
            <Card
              key={emp.id}
              className="hover:shadow-md transition-all duration-200 group"
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div
                  className="flex items-center gap-4 flex-1 cursor-pointer"
                  onClick={() => navigate('/')}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{emp.nome}</h3>
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                      <span>CNPJ: {formatCNPJ(emp.cnpj)}</span>
                      {emp.inicio_atividades && (
                        <span>Início: {formatDateBR(emp.inicio_atividades)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={cn('border', tipoColors[emp.tipo_empresa] || 'bg-muted')}>
                    {tipoLabels[emp.tipo_empresa] || emp.tipo_empresa}
                  </Badge>
                  <Badge variant="secondary">Simples Nacional</Badge>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); openEdit(emp); }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(emp); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Nova Empresa */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingId ? 'Editar Empresa' : 'Nova Empresa'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Empresa *</Label>
              <Input
                id="nome"
                placeholder="Razão Social"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={handleCNPJChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inicio">Início das Atividades</Label>
              <Input
                id="inicio"
                type="date"
                value={form.inicio_atividades}
                onChange={(e) => setForm({ ...form, inicio_atividades: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Empresa</Label>
              <div className="grid gap-2">
                {Object.entries(tipoLabels).map(([key, label]) => (
                  <label
                    key={key}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
                      form.tipo_empresa === key
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <input
                      type="radio"
                      name="tipo_empresa"
                      value={key}
                      checked={form.tipo_empresa === key}
                      onChange={(e) => setForm({ ...form, tipo_empresa: e.target.value })}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                        form.tipo_empresa === key ? 'border-primary' : 'border-muted-foreground/30'
                      )}
                    >
                      {form.tipo_empresa === key && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Regime Tributário</Label>
              <div className="p-3 rounded-lg border-2 border-border bg-muted/30">
                <span className="text-sm font-medium">Simples Nacional</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Outros regimes estarão disponíveis em breve
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? 'Salvando...' : editingId ? 'Atualizar Empresa' : 'Salvar Empresa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong>?
              Esta ação não pode ser desfeita e também removerá as apurações vinculadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}