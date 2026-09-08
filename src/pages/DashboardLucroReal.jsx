import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ShareLinkButton from '@/components/dashboard/ShareLinkButton';
import LucroRealDashboardContent from '@/components/dashboard/LucroRealDashboardContent';

export default function DashboardLucroReal() {
  const queryClient = useQueryClient();
  const [empresaId, setEmpresaId] = useState('');

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const empresasFiltradas = empresas.filter((e) => e.regime_tributario === 'lucro_real');

  const { data: apuracoes = [], isLoading } = useQuery({
    queryKey: ['apuracoes-lr', empresaId],
    queryFn: () => empresaId
      ? base44.entities.ApuracaoLucroReal.filter({ empresa_id: empresaId })
      : Promise.resolve([]),
    enabled: !!empresaId,
  });

  useEffect(() => {
    if (empresasFiltradas.length > 0 && !empresaId) {
      setEmpresaId(empresasFiltradas[0].id);
    }
  }, [empresasFiltradas, empresaId]);

  const empresa = empresas.find(e => e.id === empresaId);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <DashboardHeader
        title="Dashboard — Lucro Real"
        subtitle="Análise do SPED ICMS e PIS/COFINS (regime não-cumulativo)"
        companyName={empresa?.nome}
        infoItems={empresa ? [
          { label: 'CNPJ', value: empresa.cnpj },
          { label: 'Regime', value: 'Lucro Real' },
        ] : []}
        filters={
          <>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Selecione a empresa..." />
              </SelectTrigger>
              <SelectContent>
                {empresasFiltradas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
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

      {!empresaId && (
        <div className="text-center py-20 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Selecione uma empresa para visualizar o dashboard</p>
        </div>
      )}

      {empresaId && (
        <LucroRealDashboardContent
          empresa={empresa}
          apuracoes={apuracoes}
          isLoading={isLoading}
          emptyActionHref="/lucro-real/upload"
          emptyActionLabel="Fazer Upload"
        />
      )}
    </div>
  );
}