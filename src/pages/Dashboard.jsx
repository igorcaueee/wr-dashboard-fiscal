import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Legend, Cell, PieChart, Pie,
} from 'recharts';
import { Building2, TrendingUp, FileBarChart, PieChartIcon, Calendar } from 'lucide-react';
import { formatBRL, formatPercent, formatMesAno, periodoToSort } from '@/lib/format';
import { cn } from '@/lib/utils';
import ComprasPorCfop from '@/components/ComprasPorCfop';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ShareLinkButton from '@/components/dashboard/ShareLinkButton';

const COLORS = {
  entrada: '#0d9488',
  servico: '#f97316',
  saida: '#7c3aed',
  imposto: '#0d9488',
  aliquota: '#f97316',
};

// Formato compacto para rótulos de valores nas barras (evita sobreposição de texto)
function formatCompact(v) {
  const value = v || 0;
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
  }
  return formatBRL(value);
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [mesesVisiveis, setMesesVisiveis] = useState(6);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');

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

  const apuracoesOrdenadas = useMemo(() => {
    return [...allApuracoes]
      .filter((a) => a.periodo)
      .sort((a, b) => periodoToSort(a.periodo) - periodoToSort(b.periodo));
  }, [allApuracoes]);

  const ultimosMeses = useMemo(() => {
    return apuracoesOrdenadas.slice(-mesesVisiveis);
  }, [apuracoesOrdenadas, mesesVisiveis]);

  const ultimaApuracao = apuracoesOrdenadas[apuracoesOrdenadas.length - 1];

  const apuracaoSelecionada = useMemo(() => {
    if (!selectedPeriodo) return null;
    return apuracoesOrdenadas.find((a) => a.periodo === selectedPeriodo) || null;
  }, [apuracoesOrdenadas, selectedPeriodo]);

  const periodosDisponiveis = useMemo(() => {
    return apuracoesOrdenadas.map((a) => a.periodo).reverse();
  }, [apuracoesOrdenadas]);

  // Reset selectedPeriodo when empresa changes
  useEffect(() => {
    setSelectedPeriodo('');
  }, [selectedEmpresaId]);

  // Chart data for Compras/Vendas/Serviços
  const barData = useMemo(() => {
    return ultimosMeses.map((a) => ({
      mes: formatMesAno(a.periodo),
      Entrada: a.total_entradas || 0,
      Serviço: a.total_servicos || 0,
      Saída: (a.total_saidas_sem_st || 0) + (a.total_saidas_st || 0),
    }));
  }, [ultimosMeses]);

  // Chart data for Imposto
  const impostoData = useMemo(() => {
    return ultimosMeses.map((a) => ({
      mes: formatMesAno(a.periodo),
      imposto: a.simples_nacional_total || 0,
      aliquota: a.aliquota_efetiva || 0,
    }));
  }, [ultimosMeses]);

  const PARTILHA_COLORS = ['#0d9488', '#14b8a6', '#f97316', '#fb923c', '#7c3aed', '#a78bfa', '#e11d48'];

  const tipoEmpresa = empresa?.tipo_empresa || 'somente_servico';
  const showEntradas = tipoEmpresa !== 'somente_servico';
  const showServicos = tipoEmpresa !== 'entradas_saidas';
  const showSaidas = tipoEmpresa !== 'somente_servico';

  // Agregados do período visível para os cards de resumo
  const agregados = useMemo(() => {
    if (ultimosMeses.length === 0) return null;
    const simplesTotal = ultimosMeses.reduce((s, a) => s + (a.simples_nacional_total || 0), 0);
    const receitaTotal = ultimosMeses.reduce((s, a) => s + (a.receita_bruta_periodo || 0), 0);
    const faturamentoTotal = ultimosMeses.reduce((s, a) =>
      s + (a.total_servicos || 0) + (a.total_saidas_sem_st || 0) + (a.total_saidas_st || 0), 0);
    const aliquotaEfetiva = receitaTotal > 0 ? (simplesTotal / receitaTotal) * 100 : 0;
    const partilha = {
      valor_irpj: ultimosMeses.reduce((s, a) => s + (a.valor_irpj || 0), 0),
      valor_csll: ultimosMeses.reduce((s, a) => s + (a.valor_csll || 0), 0),
      valor_cofins: ultimosMeses.reduce((s, a) => s + (a.valor_cofins || 0), 0),
      valor_pis: ultimosMeses.reduce((s, a) => s + (a.valor_pis || 0), 0),
      valor_cpp: ultimosMeses.reduce((s, a) => s + (a.valor_cpp || 0), 0),
      valor_icms: ultimosMeses.reduce((s, a) => s + (a.valor_icms || 0), 0),
      valor_iss: ultimosMeses.reduce((s, a) => s + (a.valor_iss || 0), 0),
    };
    return { simplesTotal, receitaTotal, faturamentoTotal, aliquotaEfetiva, partilha };
  }, [ultimosMeses]);

  // Partilha data — agregado do período visível
  const partilhaData = useMemo(() => {
    if (!agregados?.partilha) return [];
    return [
      { name: 'IRPJ', value: agregados.partilha.valor_irpj },
      { name: 'CSLL', value: agregados.partilha.valor_csll },
      { name: 'COFINS', value: agregados.partilha.valor_cofins },
      { name: 'PIS', value: agregados.partilha.valor_pis },
      { name: 'CPP', value: agregados.partilha.valor_cpp },
      { name: 'ICMS', value: agregados.partilha.valor_icms },
      { name: 'ISS', value: agregados.partilha.valor_iss },
    ].filter((d) => d.value > 0);
  }, [agregados]);

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
              <>
                <Select value={String(mesesVisiveis)} onValueChange={(v) => { setMesesVisiveis(Number(v)); setSelectedPeriodo(''); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 meses</SelectItem>
                    <SelectItem value="6">6 meses</SelectItem>
                    <SelectItem value="12">12 meses</SelectItem>
                    <SelectItem value="24">24 meses</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedPeriodo} onValueChange={setSelectedPeriodo}>
                  <SelectTrigger className="w-40">
                    <Calendar className="w-4 h-4 mr-1" />
                    <SelectValue placeholder="Visão geral" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Visão geral</SelectItem>
                    {periodosDisponiveis.map((p) => (
                      <SelectItem key={p} value={p}>{formatMesAno(p)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ShareLinkButton
                  empresa={empresa}
                  onUpdated={() => queryClient.invalidateQueries({ queryKey: ['empresas'] })}
                />
              </>
            )}
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      ) : apuracoesOrdenadas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <FileBarChart className="w-16 h-16 text-muted-foreground/30 mb-6" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma apuração encontrada</h2>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            Faça o upload dos relatórios do Domínio para esta empresa.
          </p>
          <Button asChild className="gap-2">
            <a href="/simples-nacional/upload">Fazer Upload</a>
          </Button>
        </div>
      ) : (
        <div id="dashboard-content" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              title="RBT12"
              value={formatBRL(ultimaApuracao?.receita_bruta_acumulada_12m)}
              icon={TrendingUp}
              color="teal"
            />
            <SummaryCard
              title="Simples a Recolher"
              value={formatBRL(agregados?.simplesTotal)}
              icon={FileBarChart}
              color="orange"
            />
            <SummaryCard
              title="Alíquota Efetiva"
              value={formatPercent(agregados?.aliquotaEfetiva)}
              icon={PieChartIcon}
              color="purple"
            />
            <SummaryCard
              title="Faturamento Total"
              value={formatBRL(agregados?.faturamentoTotal)}
              icon={TrendingUp}
              color="green"
              subtitle={ultimosMeses.length > 0
                ? `De ${formatMesAno(ultimosMeses[0].periodo)} a ${formatMesAno(ultimosMeses[ultimosMeses.length - 1].periodo)}`
                : ''}
            />
          </div>

          {/* Relatório Mensal */}
          {apuracaoSelecionada && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Relatório Mensal — {formatMesAno(apuracaoSelecionada.periodo)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                  <MiniCard label="Receita Bruta" value={formatBRL(apuracaoSelecionada.receita_bruta_periodo)} />
                  <MiniCard label="RBT12" value={formatBRL(apuracaoSelecionada.receita_bruta_acumulada_12m)} />
                  <MiniCard label="Simples Nacional" value={formatBRL(apuracaoSelecionada.simples_nacional_total)} highlight />
                  <MiniCard label="Alíquota Efetiva" value={formatPercent(apuracaoSelecionada.aliquota_efetiva)} />
                  {apuracaoSelecionada.fator_r != null && (
                    <MiniCard label="Fator R" value={(apuracaoSelecionada.fator_r * 100).toFixed(1).replace('.', ',') + '%'} />
                  )}
                  {apuracaoSelecionada.faixa_enquadramento && (
                    <MiniCard label="Faixa" value={apuracaoSelecionada.faixa_enquadramento} />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {showEntradas && (
                    <Card className="bg-white">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground mb-1">Total de Entradas</p>
                        <p className="text-xl font-bold">{formatBRL(apuracaoSelecionada.total_entradas)}</p>
                        {apuracaoSelecionada.valor_icms_entradas > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            ICMS Entradas: {formatBRL(apuracaoSelecionada.valor_icms_entradas)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {showSaidas && (
                    <Card className="bg-white">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground mb-1">Total de Saídas</p>
                        <p className="text-xl font-bold">
                          {formatBRL((apuracaoSelecionada.total_saidas_sem_st || 0) + (apuracaoSelecionada.total_saidas_st || 0))}
                        </p>
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          {apuracaoSelecionada.total_saidas_sem_st > 0 && (
                            <p>Sem ST: {formatBRL(apuracaoSelecionada.total_saidas_sem_st)}</p>
                          )}
                          {apuracaoSelecionada.total_saidas_st > 0 && (
                            <p>Com ST: {formatBRL(apuracaoSelecionada.total_saidas_st)}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {showServicos && (
                    <Card className="bg-white">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground mb-1">Total de Serviços</p>
                        <p className="text-xl font-bold">{formatBRL(apuracaoSelecionada.total_servicos)}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Partilha do mês */}
                {(() => {
                  const partilhaMes = [
                    { name: 'IRPJ', value: apuracaoSelecionada.valor_irpj || 0 },
                    { name: 'CSLL', value: apuracaoSelecionada.valor_csll || 0 },
                    { name: 'COFINS', value: apuracaoSelecionada.valor_cofins || 0 },
                    { name: 'PIS', value: apuracaoSelecionada.valor_pis || 0 },
                    { name: 'CPP', value: apuracaoSelecionada.valor_cpp || 0 },
                    { name: 'ICMS', value: apuracaoSelecionada.valor_icms || 0 },
                    { name: 'ISS', value: apuracaoSelecionada.valor_iss || 0 },
                  ].filter((d) => d.value > 0);

                  return partilhaMes.length > 0 ? (
                    <div>
                      <p className="text-sm font-medium mb-3">Partilha do Simples Nacional</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {partilhaMes.map((d) => (
                          <div key={d.name} className="bg-white rounded-lg p-3 border">
                            <p className="text-xs text-muted-foreground">{d.name}</p>
                            <p className="text-base font-semibold">{formatBRL(d.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </CardContent>
            </Card>
          )}

          {/* Section 1: Compras, Vendas e Serviços */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Compras, Vendas e Prestação de Serviço / Faturamento Mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <EmptyChartMsg msg="Sem dados de faturamento para o período." />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      width={100}
                      tickFormatter={(v) => formatBRL(v)}
                    />
                    <Tooltip
                      formatter={(value) => formatBRL(value)}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {showEntradas && (
                      <Bar dataKey="Entrada" fill={COLORS.entrada} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#374151', fontSize: 10, formatter: formatCompact }} />
                    )}
                    {showServicos && (
                      <Bar dataKey="Serviço" fill={COLORS.servico} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#374151', fontSize: 10, formatter: formatCompact }} />
                    )}
                    {showSaidas && (
                      <Bar dataKey="Saída" fill={COLORS.saida} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#374151', fontSize: 10, formatter: formatCompact }} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Section 2: Receita Bruta Acumulada */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Receita Bruta Acumulada 12 meses</CardTitle>
              </CardHeader>
              <CardContent>
                {ultimaApuracao?.receita_bruta_acumulada_12m ? (
                  <div className="text-center py-4">
                    <p className="text-2xl font-bold text-primary">
                      {formatBRL(ultimaApuracao.receita_bruta_acumulada_12m)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">RBT12 do período {ultimaApuracao.periodo}</p>
                    {ultimaApuracao.faixa_enquadramento && (
                      <p className="text-sm font-medium text-primary mt-2">
                        Faixa de Enquadramento: {ultimaApuracao.faixa_enquadramento}
                      </p>
                    )}
                  </div>
                ) : (
                  <EmptyChartMsg msg="Não há dados" small />
                )}
              </CardContent>
            </Card>

            {/* Section 3: Imposto */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold pl-1">Imposto</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {impostoData.length === 0 ? (
                  <EmptyChartMsg msg="Sem dados de imposto." small />
                ) : (
                  <div className="w-full flex justify-center">
                    <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={impostoData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis
                       yAxisId="left"
                       tick={{ fontSize: 11, fill: '#6b7280' }}
                       axisLine={false}
                       tickLine={false}
                       width={100}
                       tickFormatter={(v) => formatBRL(v)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#f97316' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => formatPercent(v)}
                      />
                      <Tooltip
                        formatter={(value, name) => name === 'Alíquota Efetiva' ? formatPercent(value) : formatBRL(value)}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        yAxisId="left"
                        dataKey="imposto"
                        name="Simples Nacional"
                        fill={COLORS.imposto}
                        radius={[6, 6, 0, 0]}
                        label={{ position: 'top', fill: '#134e4a', fontSize: 10, fontWeight: 'bold', formatter: formatCompact }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="aliquota"
                        name="Alíquota Efetiva"
                        stroke={COLORS.aliquota}
                        strokeWidth={2}
                        dot={{ fill: COLORS.aliquota, r: 5 }}
                        label={{ position: 'top', fill: COLORS.aliquota, fontSize: 10, formatter: (v) => formatPercent(v) }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Section 4: Partilha */}
          {partilhaData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Partilha do Simples Nacional</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col lg:flex-row items-center justify-center gap-4">
                  <ResponsiveContainer width={220} height={220} className="flex-shrink-0">
                    <PieChart margin={{ top: 10, right: 60, bottom: 10, left: 10 }}>
                      <Pie
                        data={partilhaData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={false}
                      >
                        {partilhaData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PARTILHA_COLORS[index % PARTILHA_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatBRL(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm min-w-[280px]">
                    {partilhaData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 whitespace-nowrap">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PARTILHA_COLORS[i % PARTILHA_COLORS.length] }}
                        />
                        <span className="text-muted-foreground flex-shrink-0">{d.name}</span>
                        <span className="font-medium ml-auto">{formatBRL(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Compras por CFOP */}
          {(() => {
            const ap = apuracaoSelecionada || ultimaApuracao;
            if (!showEntradas || !ap?.compras_por_cfop?.length) return null;
            return <ComprasPorCfop compras={ap.compras_por_cfop} />;
          })()}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color, subtitle }) {
  const colorMap = {
    teal: 'bg-teal-50 border-teal-200',
    orange: 'bg-orange-50 border-orange-200',
    purple: 'bg-purple-50 border-purple-200',
    green: 'bg-green-50 border-green-200',
  };

  return (
    <div className={cn('rounded-xl border p-4', colorMap[color] || colorMap.teal)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-xl font-bold">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}

function MiniCard({ label, value, highlight }) {
  return (
    <div className={cn(
      'rounded-lg p-3 border',
      highlight ? 'bg-primary/10 border-primary/20' : 'bg-white'
    )}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-base font-bold mt-0.5', highlight && 'text-primary')}>{value}</p>
    </div>
  );
}

function EmptyChartMsg({ msg, small }) {
  return (
    <div className={cn('flex items-center justify-center text-muted-foreground', small ? 'py-8' : 'py-16')}>
      <p className="text-sm">{msg}</p>
    </div>
  );
}