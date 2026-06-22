import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Legend, Cell, PieChart, Pie,
} from 'recharts';
import { Building2, TrendingUp, FileBarChart, Download, PieChartIcon, Calendar, Castle } from 'lucide-react';
import { formatBRL, formatPercent, formatMesAno, periodoToSort } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLORS = {
  entrada: '#0d9488',
  servico: '#f97316',
  saida: '#7c3aed',
  imposto: '#0d9488',
  aliquota: '#f97316',
};

export default function Dashboard() {
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [mesesVisiveis, setMesesVisiveis] = useState(6);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

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
    if (empresas.length > 0 && !selectedEmpresaId) {
      setSelectedEmpresaId(empresas[0].id);
    }
  }, [empresas, selectedEmpresaId]);

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

  // Partilha data
  const partilhaData = useMemo(() => {
    if (!ultimaApuracao) return [];
    return [
      { name: 'IRPJ', value: ultimaApuracao.valor_irpj || 0 },
      { name: 'CSLL', value: ultimaApuracao.valor_csll || 0 },
      { name: 'COFINS', value: ultimaApuracao.valor_cofins || 0 },
      { name: 'PIS', value: ultimaApuracao.valor_pis || 0 },
      { name: 'CPP', value: ultimaApuracao.valor_cpp || 0 },
      { name: 'ICMS', value: ultimaApuracao.valor_icms || 0 },
      { name: 'ISS', value: ultimaApuracao.valor_iss || 0 },
    ].filter((d) => d.value > 0);
  }, [ultimaApuracao]);

  const PARTILHA_COLORS = ['#0d9488', '#14b8a6', '#f97316', '#fb923c', '#7c3aed', '#a78bfa', '#e11d48'];

  const tipoEmpresa = empresa?.tipo_empresa || 'somente_servico';
  const showEntradas = tipoEmpresa !== 'somente_servico';
  const showServicos = tipoEmpresa !== 'entradas_saidas';
  const showSaidas = tipoEmpresa !== 'somente_servico';

  // Calculate totals for summary cards
  const totalUltimoMes = ultimaApuracao
    ? (ultimaApuracao.total_servicos || 0) +
      ((ultimaApuracao.total_saidas_sem_st || 0) + (ultimaApuracao.total_saidas_st || 0))
    : 0;

  const handleExportPDF = async () => {
    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');
    const element = document.getElementById('dashboard-content');
    if (!element) return;

    // Temporariamente força largura fixa A4 para captura uniforme
    const originalWidth = element.style.width;
    element.style.width = '794px'; // ~210mm em 96dpi
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, windowWidth: 794 });
    element.style.width = originalWidth;

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const marginX = 8; // mm
    const marginY = 8;
    const imgWidth = pageWidth - marginX * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Se a imagem for mais alta que uma página, divide em múltiplas
    const pageHeight = pdf.internal.pageSize.getHeight() - marginY * 2;
    let heightLeft = imgHeight;
    let position = marginY;

    pdf.addImage(imgData, 'PNG', marginX, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = marginY - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', marginX, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`dashboard-${empresa?.nome || 'fiscal'}.pdf`);
  };

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
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      {empresa && (
        <div className="bg-primary rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10">
            <Castle className="w-32 h-32 -mt-4 -mr-4" />
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Select value={selectedEmpresaId} onValueChange={setSelectedEmpresaId}>
                  <SelectTrigger className="border-0 bg-white/10 p-0 h-auto text-xl font-bold hover:no-underline focus:ring-0 text-white [&>span]:text-white">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-white/80">
                CNPJ: {empresa.cnpj}
              </p>
              <p className="text-sm text-white/80">
                Início das Atividades: {empresa.inicio_atividades ? new Date(empresa.inicio_atividades + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={String(mesesVisiveis)} onValueChange={(v) => { setMesesVisiveis(Number(v)); setSelectedPeriodo(''); }}>
                <SelectTrigger className="w-36 bg-white/10 border-white/20 text-white data-[placeholder]:text-white/60">
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
                <SelectTrigger className="w-44 bg-white/10 border-white/20 text-white data-[placeholder]:text-white/60">
                  <Calendar className="w-4 h-4 mr-1" />
                  <SelectValue placeholder="Mês específico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Visão geral</SelectItem>
                  {periodosDisponiveis.map((p) => (
                    <SelectItem key={p} value={p}>{formatMesAno(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExportPDF} className="gap-2 border-white/20 text-white hover:bg-white/10">
                <Download className="w-4 h-4" /> Exportar PDF
              </Button>
            </div>
          </div>
        </div>
      )}
      {!empresa && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <Select value={selectedEmpresaId} onValueChange={setSelectedEmpresaId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              title="RBT12"
              value={formatBRL(ultimaApuracao?.receita_bruta_acumulada_12m)}
              icon={TrendingUp}
              color="teal"
            />
            <SummaryCard
              title="Simples a Recolher"
              value={formatBRL(ultimaApuracao?.simples_nacional_total)}
              icon={FileBarChart}
              color="orange"
            />
            <SummaryCard
              title="Alíquota Efetiva"
              value={formatPercent(ultimaApuracao?.aliquota_efetiva)}
              icon={PieChartIcon}
              color="purple"
            />
            <SummaryCard
              title="Faturamento Total"
              value={formatBRL(totalUltimoMes)}
              icon={TrendingUp}
              color="green"
              subtitle={`Período ${ultimaApuracao?.periodo || '-'}`}
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
                <ResponsiveContainer width="100%" height={350}>
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
                      <Bar dataKey="Entrada" fill={COLORS.entrada} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#374151', fontSize: 10, formatter: (v) => formatBRL(v) }} />
                    )}
                    {showServicos && (
                      <Bar dataKey="Serviço" fill={COLORS.servico} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#374151', fontSize: 10, formatter: (v) => formatBRL(v) }} />
                    )}
                    {showSaidas && (
                      <Bar dataKey="Saída" fill={COLORS.saida} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#374151', fontSize: 10, formatter: (v) => formatBRL(v) }} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section 2: Receita Bruta Acumulada */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Receita Bruta Acumulada 12 meses</CardTitle>
              </CardHeader>
              <CardContent>
                {ultimaApuracao?.receita_bruta_acumulada_12m ? (
                  <div className="text-center py-6">
                    <p className="text-3xl font-bold text-primary">
                      {formatBRL(ultimaApuracao.receita_bruta_acumulada_12m)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">RBT12 do período {ultimaApuracao.periodo}</p>
                    {ultimaApuracao.faixa_enquadramento && (
                      <p className="text-xs text-muted-foreground mt-3 bg-muted inline-block px-3 py-1 rounded-full">
                        {ultimaApuracao.faixa_enquadramento}
                      </p>
                    )}
                  </div>
                ) : (
                  <EmptyChartMsg msg="Não há dados" small />
                )}
              </CardContent>
            </Card>

            {/* Section 3: Imposto */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Imposto</CardTitle>
              </CardHeader>
              <CardContent>
                {impostoData.length === 0 ? (
                  <EmptyChartMsg msg="Sem dados de imposto." small />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={impostoData}>
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
                        formatter={(value, name) => name === 'aliquota' ? formatPercent(value) : formatBRL(value)}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        yAxisId="left"
                        dataKey="imposto"
                        name="Simples Nacional"
                        fill={COLORS.imposto}
                        radius={[6, 6, 0, 0]}
                        label={{ position: 'top', fill: '#fff', fontSize: 10, fontWeight: 'bold', formatter: (v) => formatBRL(v) }}
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
                <div className="flex flex-col lg:flex-row items-center gap-6">
                  <ResponsiveContainer width="100%" height={300} className="max-w-sm">
                    <PieChart>
                      <Pie
                        data={partilhaData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={110}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${formatBRL(value)}`}
                        labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                      >
                        {partilhaData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PARTILHA_COLORS[index % PARTILHA_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatBRL(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    {partilhaData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PARTILHA_COLORS[i % PARTILHA_COLORS.length] }}
                        />
                        <span className="text-muted-foreground">{d.name}</span>
                        <span className="font-medium ml-auto">{formatBRL(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color, subtitle }) {
  const colorMap = {
    teal: 'bg-teal-50 text-teal-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
    green: 'bg-green-50 text-green-700',
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-xl font-bold mt-1 text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', colorMap[color] || colorMap.teal)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
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