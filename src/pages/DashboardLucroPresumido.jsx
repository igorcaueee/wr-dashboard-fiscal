import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, ShoppingCart, Receipt, AlertTriangle, Info, AlertCircle } from 'lucide-react';

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
      {items.map((item, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium truncate mr-2">{item[labelKey]}</span>
            <span className="text-muted-foreground flex-shrink-0">{fmtBRL(item[valueKey])}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${colorClass}`}
              style={{ width: max > 0 ? `${(item[valueKey] / max) * 100}%` : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardLucroPresumido() {
  const [empresaId, setEmpresaId] = useState('');
  const [periodoId, setPeriodoId] = useState('');

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const { data: apuracoes = [] } = useQuery({
    queryKey: ['apuracoes-lp', empresaId],
    queryFn: () => empresaId
      ? base44.entities.ApuracaoLucroPresumido.filter({ empresa_id: empresaId })
      : Promise.resolve([]),
    enabled: !!empresaId,
  });

  const empresa = empresas.find(e => e.id === empresaId);

  const periodosOrdenados = useMemo(() => {
    return [...apuracoes].sort((a, b) => {
      const [ma, ya] = a.periodo.split('/').map(Number);
      const [mb, yb] = b.periodo.split('/').map(Number);
      return ya !== yb ? ya - yb : ma - mb;
    });
  }, [apuracoes]);

  const apuracao = periodoId
    ? apuracoes.find(a => a.id === periodoId)
    : periodosOrdenados[periodosOrdenados.length - 1];

  const indicadores = useMemo(() => {
    if (!apuracao) return null;
    const fat = apuracao.total_vendas || 0;
    const compras = apuracao.total_compras || 0;
    const icms = apuracao.icms_saldo || 0;
    const pis = apuracao.pis_saldo || 0;
    const cofins = apuracao.cofins_saldo || 0;
    const tributos = Math.abs(icms) + Math.abs(pis) + Math.abs(cofins);

    return {
      carga_efetiva: fat > 0 ? (tributos / fat) * 100 : 0,
      icms_fat: fat > 0 ? (Math.abs(icms) / fat) * 100 : 0,
      pis_fat: fat > 0 ? (Math.abs(pis) / fat) * 100 : 0,
      cofins_fat: fat > 0 ? (Math.abs(cofins) / fat) * 100 : 0,
      compras_fat: fat > 0 ? (compras / fat) * 100 : 0,
      ticket_medio: (apuracao.qtd_notas_vendas || 0) > 0 ? fat / apuracao.qtd_notas_vendas : 0,
      receita_por_nota: (apuracao.qtd_notas_vendas || 0) > 0 ? fat / apuracao.qtd_notas_vendas : 0,
      compra_por_nota: (apuracao.qtd_notas_compras || 0) > 0 ? compras / apuracao.qtd_notas_compras : 0,
    };
  }, [apuracao]);

  const chartComprasFaturamento = useMemo(() => {
    if (!periodosOrdenados.length) return [];
    return periodosOrdenados.map(a => ({
      periodo: a.periodo,
      Compras: a.total_compras || 0,
      Faturamento: a.total_vendas || 0,
    }));
  }, [periodosOrdenados]);

  const chartICMS = useMemo(() => {
    if (!periodosOrdenados.length) return [];
    return periodosOrdenados.map(a => ({
      periodo: a.periodo,
      Débito: a.icms_debito || 0,
      Crédito: a.icms_credito || 0,
      Saldo: Math.abs(a.icms_saldo || 0),
    }));
  }, [periodosOrdenados]);

  const chartPIS = useMemo(() => {
    if (!periodosOrdenados.length) return [];
    return periodosOrdenados.map(a => ({
      periodo: a.periodo,
      Débito: a.pis_debito || 0,
    }));
  }, [periodosOrdenados]);

  const chartCOFINS = useMemo(() => {
    if (!periodosOrdenados.length) return [];
    return periodosOrdenados.map(a => ({
      periodo: a.periodo,
      Débito: a.cofins_debito || 0,
    }));
  }, [periodosOrdenados]);

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

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard — Lucro Presumido</h1>
          <p className="text-muted-foreground text-sm mt-1">Análise do SPED ICMS e PIS/COFINS</p>
        </div>
        <div className="flex gap-3">
          <Select value={empresaId} onValueChange={(v) => { setEmpresaId(v); setPeriodoId(''); }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Selecione a empresa..." />
            </SelectTrigger>
            <SelectContent>
              {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          {apuracoes.length > 0 && (
            <Select value={periodoId} onValueChange={setPeriodoId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {periodosOrdenados.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.periodo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!empresaId && (
        <div className="text-center py-20 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Selecione uma empresa para visualizar o dashboard</p>
        </div>
      )}

      {empresaId && apuracoes.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p>Nenhuma apuração encontrada. Faça o upload dos SPEDs primeiro.</p>
        </div>
      )}

      {apuracao && (
        <>
          {/* Info empresa */}
          <div className="p-4 rounded-xl bg-primary text-primary-foreground flex flex-wrap items-center gap-4 justify-between">
            <div className="font-semibold text-lg">{empresa?.nome || apuracao.nome_empresa}</div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Período: <strong>{apuracao.periodo}</strong></span>
              {apuracao.cnpj && (
                <span>CNPJ: <strong>{apuracao.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</strong></span>
              )}
              <span>Regime: <strong>Lucro Presumido</strong></span>
            </div>
          </div>

          {/* KPIs principais */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard title="Compras" value={fmtBRL(apuracao.total_compras)} sub={`${apuracao.qtd_notas_compras || 0} notas`} icon={ShoppingCart} />
            <MetricCard title="Faturamento" value={fmtBRL(apuracao.total_vendas)} sub={`${apuracao.qtd_notas_vendas || 0} notas`} icon={TrendingUp} />
            <MetricCard title="ICMS" value={fmtBRL(Math.abs(apuracao.icms_saldo))} sub={(apuracao.icms_saldo || 0) >= 0 ? 'Saldo Devedor' : 'Saldo Credor'} variant={(apuracao.icms_saldo || 0) >= 0 ? 'warning' : 'success'} />
            <MetricCard title="PIS" value={fmtBRL(Math.abs(apuracao.pis_saldo))} sub={(apuracao.pis_saldo || 0) >= 0 ? 'Saldo Devedor' : 'Saldo Credor'} variant={(apuracao.pis_saldo || 0) >= 0 ? 'warning' : 'success'} />
            <MetricCard title="COFINS" value={fmtBRL(Math.abs(apuracao.cofins_saldo))} sub={(apuracao.cofins_saldo || 0) >= 0 ? 'Saldo Devedor' : 'Saldo Credor'} variant={(apuracao.cofins_saldo || 0) >= 0 ? 'warning' : 'success'} />
          </div>

          {/* Gráfico Compras x Faturamento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compras e Faturamento</CardTitle>
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
                  <Bar dataKey="Faturamento" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ICMS */}
          <div>
            <h2 className="text-base font-semibold mb-3">ICMS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SaldoCard
                title="Apuração ICMS"
                debito={apuracao.icms_debito}
                credito={apuracao.icms_credito}
                saldo={apuracao.icms_saldo}
              />
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
                      <Bar dataKey="Saldo" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]} />
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
              <SaldoCard
                title="Apuração PIS"
                debito={apuracao.pis_debito}
                credito={apuracao.pis_credito}
                saldo={apuracao.pis_saldo}
                showCredito={false}
                showSaldo={false}
              />
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
              <SaldoCard
                title="Apuração COFINS"
                debito={apuracao.cofins_debito}
                credito={apuracao.cofins_credito}
                saldo={apuracao.cofins_saldo}
                showCredito={false}
                showSaldo={false}
              />
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
                <HorizontalBar
                  items={apuracao.vendas_por_cfop || []}
                  labelKey="cfop"
                  valueKey="valor"
                  colorClass="bg-primary"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBar
                  items={(apuracao.top_clientes || []).slice(0, 5)}
                  labelKey="nome"
                  valueKey="valor"
                  colorClass="bg-chart-2"
                />
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
                <HorizontalBar
                  items={apuracao.compras_por_cfop || []}
                  labelKey="cfop"
                  valueKey="valor"
                  colorClass="bg-chart-3"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Fornecedores</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBar
                  items={(apuracao.top_fornecedores || []).slice(0, 5)}
                  labelKey="nome"
                  valueKey="valor"
                  colorClass="bg-chart-4"
                />
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <MetricCard title="Carga Tributária Efetiva" value={fmtPct(indicadores.carga_efetiva)} />
                  <MetricCard title="ICMS / Faturamento" value={fmtPct(indicadores.icms_fat)} />
                  <MetricCard title="PIS / Faturamento" value={fmtPct(indicadores.pis_fat)} />
                  <MetricCard title="COFINS / Faturamento" value={fmtPct(indicadores.cofins_fat)} />
                  <MetricCard title="Compras / Faturamento" value={fmtPct(indicadores.compras_fat)} />
                  <MetricCard title="Ticket Médio (Vendas)" value={fmtBRL(indicadores.ticket_medio)} />
                  <MetricCard title="Receita por Nota" value={fmtBRL(indicadores.receita_por_nota)} />
                  <MetricCard title="Compra por Nota" value={fmtBRL(indicadores.compra_por_nota)} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Alertas */}
          {apuracao.alertas && apuracao.alertas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Pré-Análise — Alertas e Apontamentos Fiscais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {apuracao.alertas.map((a, idx) => (
                    <div key={idx} className={`flex gap-3 p-3 rounded-lg border ${alertaClass(a.tipo)}`}>
                      {alertaIcone(a.tipo)}
                      <div className="flex-1">
                        <Badge variant="outline" className="text-xs mb-1">
                          {a.tipo === 'erro' ? 'Erro' : a.tipo === 'aviso' ? 'Aviso' : 'Info'}
                        </Badge>
                        <p className="text-sm text-foreground">{a.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}