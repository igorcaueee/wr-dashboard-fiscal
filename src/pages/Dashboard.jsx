import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FileBarChart } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ShareLinkButton from '@/components/dashboard/ShareLinkButton';
import SimplesNacionalDashboardContent from '@/components/dashboard/SimplesNacionalDashboardContent';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const empresasFiltradas = empresas.filter((e) => !e.regime_tributario || e.regime_tributario === 'simples_nacional');

  const { data: allApuracoes = [], isLoading } = useQuery({
    queryKey: ['apuracoes', selectedEmpresaId],
    queryFn: () =>
      selectedEmpresaId
        ? base44.entities.Apuracao.filter({ empresa_id: selectedEmpresaId }, '-periodo', 60)
        : Promise.resolve([]),
    enabled: !!selectedEmpresaId,
  });

  // Auto-select first empresa
  useEffect(() => {
    if (empresasFiltradas.length > 0 && !selectedEmpresaId) {
      setSelectedEmpresaId(empresasFiltradas[0].id);
    }
  }, [empresasFiltradas, selectedEmpresaId]);

  const empresa = empresas.find((e) => e.id === selectedEmpresaId);

  if (empresas.length === 0) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24">
          <FileBarChart className="w-16 h-16 text-muted-foreground/30 mb-6" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma apuração encontrada</h2>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            Cadastre uma empresa e faça o upload dos relatórios do Domínio para visualizar os dashboards.
          </p>
          <Button asChild className="gap-2">
            <a href="/empresas">Cadastrar primeira empresa</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <DashboardHeader
        title="Dashboard — Simples Nacional"
        subtitle="Análise das apurações do Simples Nacional"
        companyName={empresa?.nome}
        infoItems={empresa ? [
          { label: 'CNPJ', value: empresa.cnpj },
          { label: 'Início das Atividades', value: empresa.inicio_atividades ? new Date(empresa.inicio_atividades + 'T00:00:00').toLocaleDateString('pt-BR') : '-' },
          { label: 'Regime', value: 'Simples Nacional' },
        ] : []}
        filters={
          <>
            <Select value={selectedEmpresaId} onValueChange={setSelectedEmpresaId}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Selecione a empresa..." />
              </SelectTrigger>
              <SelectContent>
                {empresasFiltradas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {empresa && (
              <ShareLinkButton
                empresa={empresa}
                onUpdated={() => queryClient.invalidateQueries({ queryKey: ['empresas'] })}
              />
            )}
          </>
        }
      />

      <SimplesNacionalDashboardContent
        empresa={empresa}
        apuracoes={allApuracoes}
        isLoading={isLoading}
        emptyActionHref="/simples-nacional/upload"
        emptyActionLabel="Fazer Upload"
      />
    </div>
  );
}