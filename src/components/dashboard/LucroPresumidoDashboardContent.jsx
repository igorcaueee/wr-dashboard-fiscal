import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, ShoppingCart, Receipt, AlertTriangle, Info, AlertCircle, X, Calendar, FileBarChart } from 'lucide-react';
import { getCfopDescricao, isCfopVenda, isCfopCompra } from '@/lib/cfop';

// Mescla arrays de diferentes períodos somando os valores por chave (ex: por CFOP ou por cliente)
function mergeByKey(arrays, key, valueKeys) {
  const map = new Map();
  arrays.forEach(arr => (arr || []).forEach(item => {
    const k = item[key];
    if (!map.has(k)) map.set(k, { ...item });
    else {
      const entry = map.get(k);
      valueKeys.forEach(vk => { entry[vk] = (entry[vk] || 0) + (item[vk] || 0); });
    }
  }));
  return Array.from(map.values()).sort((a, b) => (b[valueKeys[0]] || 0) - (a[valueKeys[0]] || 0));
}

const fmtBRL = (v) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) =>
  (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

function MetricCard({ title, value, sub, variant = 'default', icon: Icon }) {
  const colors = {
    default: 'bg-card border',
    primary: 'bg-primary text-primary-foreground border-primary',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-amber-50 border-amber-200',
    danger: 'bg-red-50 border-red-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[variant]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function SaldoCard({ title, debito, credito, saldo, showCredito = true, showSaldo = true }) {
  const isDevedor = saldo >= 0;
  const cols = !showCredito && !showSaldo ? 'grid-cols-1' : showCredito && showSaldo ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-3 mb-3 ${cols}`}>
          <div className="text-center p-3 rounded-lg bg-red-50 border border-red-100">
            <div className="text-xs text-muted-foreground mb-1">Débito</div>
            <div className="text-sm font-semibold text-red-700">{fmtBRL(debito)}</div>
          </div>
          {showCredito && (
            <div className="text-center p-3 rounded-lg bg-green-50 border border-green-100">
              <div className="text-xs text-muted-foreground mb-1">Crédito</div>
              <div className="text-sm font-semibold text-green-700">{fmtBRL(credito)}</div>
            </div>
          )}
          {showSaldo && (
            <div className={`text-center p-3 rounded-lg border ${isDevedor ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="text-xs text-muted-foreground mb-1">Saldo</div>
              <div className={`text-sm font-semibold ${isDevedor ? 'text-amber-700' : 'text-green-700'}`}>
                {fmtBRL(Math.abs(saldo))}
                <span className="block text-xs font-normal">{isDevedor ? 'Devedor' : 'Credor'}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HorizontalBar({ items, labelKey, valueKey, colorClass = 'bg-primary' }) {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">Sem dados</p>;
  const max = Math.max(...items.map(i => i[valueKey] || 0));
  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const descricao = getCfopDescricao(item[labelKey]);
        return (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{item[labelKey]}</span>
                {descricao && (
                  <span className="text-xs text-muted-foreground"> — {descricao}</span>
                )}
              </div>
              <span className="text-muted-foreground flex-shrink-0">{fmtBRL(item[valueKey])}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${colorClass}`}
                style={{ width: max > 0 ? `${(item[valueKey] / max) * 100}%` : '0%' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Conteúdo completo do dashboard do Lucro Presumido (filtros de período, cards,
// gráficos, rankings de CFOP e alertas). Usado tanto na página autenticada
// quanto na página pública de compartilhamento, para que ambas mostrem
// exatamente as mesmas seções.
export default function LucroPresumidoDashboardContent({
  empresa,
  apuracoes = [],
  isLoading = false,
  emptyActionHref,
  emptyActionLabel,
}) {
  const [mesesVisiveis, setMesesVisiveis] = useState(6);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());

  const periodosOrdenados = useMemo(() => {
    return [...apuracoes].filter(a => a.periodo).sort((a, b) => {
      const [ma, ya] = a.periodo.split('/').map(Number);
      const [mb, yb] = b.periodo.split('/').map(Number);
      return ya !== yb ? ya - yb : ma - mb;
    });
  }, [apuracoes]);

  const ultimosMeses = useMemo(() => periodosOrdenados.slice(-mesesVisiveis), [periodosOrdenados, mesesVisiveis]);

  const apuracaoSelecionada = useMemo(() => {
    if (!selectedPeriodo) return null;
    return periodosOrdenados.find(a => a.periodo === selectedPeriodo) || null;
  }, [periodosOrdenados, selectedPeriodo]);

  // Visão geral: soma/mescla os dados dos períodos visíveis
  const agregado = useMemo(() => {
    if (ultimosMeses.length === 0) return null;
    const sum = (field) => ultimosMeses.reduce((s, a) => s + (a[field] || 0), 0);
    const ultimo = ultimosMeses[ultimosMeses.length - 1];
    return {
      periodo: ultimosMeses.length > 1 ? `${ultimosMeses[0].periodo} a ${ultimo.periodo}` : ultimo.periodo,
      cnpj: ultimo.cnpj,
      nome_empresa: ultimo.nome_empresa,
      total_compras: sum('total_compras'),
      qtd_notas_compras: sum('qtd_notas_compras'),
      total_vendas: sum('total_vendas'),
      qtd_notas_vendas: sum('qtd_notas_vendas'),
      total_servicos_prestados: sum('total_servicos_prestados'),
      icms_debito: sum('icms_debito'),
      icms_credito: sum('icms_credito'),
      icms_saldo: sum('icms_saldo'),
      pis_debito: sum('pis_debito'),
      pis_credito: sum('pis_credito'),
      pis_saldo: sum('pis_saldo'),
      cofins_debito: sum('cofins_debito'),
      cofins_credito: sum('cofins_credito'),
      cofins_saldo: sum('cofins_saldo'),
      vendas_por_cfop: mergeByKey(ultimosMeses.map(a => a.vendas_por_cfop), 'cfop', ['valor', 'qtd_notas']),
      compras_por_cfop: mergeByKey(ultimosMeses.map(a => a.compras_por_cfop), 'cfop', ['valor', 'credito_icms']),
      top_clientes: mergeByKey(ultimosMeses.map(a => a.top_clientes), 'nome', ['valor', 'qtd_notas']),
      top_fornecedores: mergeByKey(ultimosMeses.map(a => a.top_fornecedores), 'nome', ['valor', 'qtd_notas', 'credito_icms']),
    };
  }, [ultimosMeses]);

  const apuracao = selectedPeriodo ? apuracaoSelecionada : agregado;

  const indicadores = useMemo(() => {
    if (!apuracao) return null;
    const fat = (apuracao.vendas_por_cfop || [])
      .filter(item => isCfopVenda(item.cfop))
      .reduce((sum, item) => sum + (item.valor || 0), 0)
      + (apuracao.total_servicos_prestados || 0);
    const compras = (apuracao.compras_por_cfop || [])
      .filter(item => isCfopCompra(item.cfop))
      .reduce((sum, item) => sum + (item.valor || 0), 0);
    const icmsPago = Math.max(apuracao.icms_saldo || 0, 0);
    const pisPago = Math.max(apuracao.pis_saldo || 0, 0);
    const cofinsPago = Math.max(apuracao.cofins_saldo || 0, 0);
    const tributos = icmsPago + pisPago + cofinsPago;

    return {
      total_impostos_pagos: tributos,
      carga_efetiva: fat > 0 ? (tributos / fat) * 100 : 0,
      icms_fat: fat > 0 ? (icmsPago / fat) * 100 : 0,
      pis_fat: fat > 0 ? (pisPago / fat) * 100 : 0,
      cofins_fat: fat > 0 ? (cofinsPago / fat) * 100 : 0,
      compras_fat: fat > 0 ? (compras / fat) * 100 : 0,
    };
  }, [apuracao]);

  const chartComprasFaturamento = useMemo(() => {
    if (!ultimosMeses.length) return [];
    return ultimosMeses.map(a => ({
      periodo: a.periodo,
      Compras: a.total_compras || 0,
      Vendas: a.total_vendas || 0,
      'Serviços Prestados': a.total_servicos_prestados || 0,
    }));
  }, [ultimosMeses]);

  const temServicosPrestados = useMemo(
    () => ultimosMeses.some(a => (a.total_servicos_prestados || 0) > 0),
    [ultimosMeses]
  );

  const chartICMS = useMemo(() => {
    if (!ultimosMeses.length) return [];
    return ultimosMeses.map(a => {
      const saldo = a.icms_saldo || 0;
      const isCredor = saldo < 0;
      return {
        periodo: a.periodo,
        Débito: a.icms_debito || 0,
        Crédito: a.icms_credito || 0,
        'Valor a Pagar': isCredor ? 0 : Math.abs(saldo),
        'Saldo Credor': isCredor ? Math.abs(saldo) : 0,
      };
    });
  }, [ultimosMeses]);

  const chartPIS = useMemo(() => {
    if (!ultimosMeses.length) return [];
    return ultimosMeses.map(a => ({ periodo: a.periodo, Débito: a.pis_debito || 0 }));
  }, [ultimosMeses]);

  const chartCOFINS = useMemo(() => {
    if (!ultimosMeses.length) return [];
    return ultimosMeses.map(a => ({ periodo: a.periodo, Débito: a.cofins_debito || 0 }));
  }, [ultimosMeses]);

  const alertaIcone = (tipo) => {
    if (tipo === 'erro') return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    if (tipo === 'aviso') return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  };
  const alertaClass = (tipo) => {
    if (tipo === 'erro') return 'bg-red-50 border-red-200';
    if (tipo === 'aviso') return 'bg-amber-50 border-amber-200';
    return 'bg-blue-50 border-blue-200';
  };

  const tooltipFormatter = (value) => fmtBRL(value);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (periodosOrdenados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <FileBarChart className="w-16 h-16 text-muted-foreground/30 mb-6" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Nenhuma apuração encontrada</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          Nenhum dado disponível para esta empresa.
        </p>
        {emptyActionHref && (
          <Button asChild className="gap-2">
            <a href={emptyActionHref}>{emptyActionLabel}</a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros de período */}
      <div className="flex flex-wrap items-center gap-2" data-no-export>
        <Select value={String(mesesVisiveis)} onValueChange={(v) => { setMesesVisiveis(Number(v)); setSelectedPeriodo(''); }}>
          <SelectTrigger className="w-32">
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
            {periodosOrdenados.map(a => (
              <SelectItem key={a.periodo} value={a.periodo}>{a.periodo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {apuracao && (
        <>
          {/* KPIs principais */}
          <div className={`grid grid-cols-2 gap-3 ${apuracao.total_servicos_prestados > 0 ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
            <MetricCard title="Compras" value={fmtBRL(apuracao.total_compras)} sub={`${apuracao.qtd_notas_compras || 0} notas`} icon={ShoppingCart} />
            <MetricCard title="Faturamento" value={fmtBRL(apuracao.total_vendas)} sub={`${apuracao.qtd_notas_vendas || 0} notas`} icon={TrendingUp} />
            {apuracao.total_servicos_prestados > 0 && (
              <MetricCard title="Serviços Prestados" value={fmtBRL(apuracao.total_servicos_prestados)} icon={TrendingUp} />
            )}
            <MetricCard title="ICMS" value={fmtBRL(Math.abs(apuracao.icms_saldo))} sub={(apuracao.icms_saldo || 0) >= 0 ? 'Valor a Pagar' : 'Saldo Credor'} variant={(apuracao.icms_saldo || 0) >= 0 ? 'warning' : 'success'} />
            <MetricCard title="PIS" value={fmtBRL(Math.abs(apuracao.pis_saldo))} sub={(apuracao.pis_saldo || 0) >= 0 ? 'Valor a Pagar' : 'Saldo Credor'} variant={(apuracao.pis_saldo || 0) >= 0 ? 'warning' : 'success'} />
            <MetricCard title="COFINS" value={fmtBRL(Math.abs(apuracao.cofins_saldo))} sub={(apuracao.cofins_saldo || 0) >= 0 ? 'Valor a Pagar' : 'Saldo Credor'} variant={(apuracao.cofins_saldo || 0) >= 0 ? 'warning' : 'success'} />
          </div>

          {/* Gráfico Compras x Faturamento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compras, Vendas e Serviços Prestados</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartComprasFaturamento}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={tooltipFormatter} />
                  <Legend />
                  <Bar dataKey="Compras" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Vendas" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  {temServicosPrestados && (
                    <Bar dataKey="Serviços Prestados" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ICMS */}
          <div>
            <h2 className="text-base font-semibold mb-3">ICMS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SaldoCard title="Apuração ICMS" debito={apuracao.icms_debito} credito={apuracao.icms_credito} saldo={apuracao.icms_saldo} />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Evolução Mensal — ICMS</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartICMS}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={tooltipFormatter} />
                      <Legend />
                      <Bar dataKey="Débito" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Crédito" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Valor a Pagar" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Saldo Credor" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* PIS */}
          <div>
            <h2 className="text-base font-semibold mb-3">PIS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SaldoCard title="Apuração PIS" debito={apuracao.pis_debito} credito={apuracao.pis_credito} saldo={apuracao.pis_saldo} showCredito={false} showSaldo={false} />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Evolução Mensal — PIS</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartPIS}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={tooltipFormatter} />
                      <Legend />
                      <Bar dataKey="Débito" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* COFINS */}
          <div>
            <h2 className="text-base font-semibold mb-3">COFINS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SaldoCard title="Apuração COFINS" debito={apuracao.cofins_debito} credito={apuracao.cofins_credito} saldo={apuracao.cofins_saldo} showCredito={false} showSaldo={false} />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Evolução Mensal — COFINS</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartCOFINS}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={tooltipFormatter} />
                      <Legend />
                      <Bar dataKey="Débito" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Faturamento por CFOP e Top Clientes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Faturamento por CFOP</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBar items={apuracao.vendas_por_cfop || []} labelKey="cfop" valueKey="valor" colorClass="bg-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBar items={(apuracao.top_clientes || []).slice(0, 5)} labelKey="nome" valueKey="valor" colorClass="bg-chart-2" />
              </CardContent>
            </Card>
          </div>

          {/* Compras por CFOP e Top Fornecedores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Compras por CFOP</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBar items={apuracao.compras_por_cfop || []} labelKey="cfop" valueKey="valor" colorClass="bg-chart-3" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Fornecedores</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBar items={(apuracao.top_fornecedores || []).slice(0, 5)} labelKey="nome" valueKey="valor" colorClass="bg-chart-4" />
              </CardContent>
            </Card>
          </div>

          {/* Indicadores tributários */}
          {indicadores && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Indicadores Tributários</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <MetricCard title="Carga Tributária Efetiva" value={fmtPct(indicadores.carga_efetiva)} />
                  <MetricCard title="Total de Impostos Pagos" value={fmtBRL(indicadores.total_impostos_pagos)} sub="PIS + COFINS + ICMS" />
                  <MetricCard title="ICMS / Faturamento" value={fmtPct(indicadores.icms_fat)} />
                  <MetricCard title="PIS / Faturamento" value={fmtPct(indicadores.pis_fat)} />
                  <MetricCard title="COFINS / Faturamento" value={fmtPct(indicadores.cofins_fat)} />
                  <MetricCard title="Compras / Faturamento" value={fmtPct(indicadores.compras_fat)} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Alertas */}
          {apuracao.alertas && apuracao.alertas.filter((_, i) => !dismissedAlerts.has(i)).length > 0 && (
            <Card data-no-export>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Pré-Análise — Alertas e Apontamentos Fiscais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {apuracao.alertas.map((a, idx) => {
                    if (dismissedAlerts.has(idx)) return null;
                    return (
                      <div key={idx} className={`flex gap-3 p-3 rounded-lg border ${alertaClass(a.tipo)}`}>
                        {alertaIcone(a.tipo)}
                        <div className="flex-1">
                          <Badge variant="outline" className="text-xs mb-1">
                            {a.tipo === 'erro' ? 'Erro' : a.tipo === 'aviso' ? 'Aviso' : 'Info'}
                          </Badge>
                          <p className="text-sm text-foreground">{a.descricao}</p>
                        </div>
                        <button
                          onClick={() => setDismissedAlerts((prev) => new Set(prev).add(idx))}
                          className="text-muted-foreground hover:text-foreground flex-shrink-0"
                          aria-label="Remover alerta"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}