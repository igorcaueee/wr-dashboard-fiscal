import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend,
} from 'recharts';
import { Building2, AlertCircle, Loader2 } from 'lucide-react';
import { formatBRL, formatPercent } from '@/lib/format';

const COLORS = { compras: '#0d9488', vendas: '#7c3aed', servicos: '#f97316', imposto: '#0d9488', aliquota: '#f97316' };

export default function DashboardPublico() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    base44.functions.invoke('dashboardPublico', { token })
      .then((res) => { if (active) setData(res.data); })
      .catch((err) => {
        if (!active) return;
        const msg = err?.response?.data?.message || err?.response?.data?.error || 'Não foi possível carregar o dashboard.';
        setError(msg);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-lg font-semibold mb-2">Link inválido ou expirado</h1>
        <p className="text-muted-foreground max-w-md">{error || 'Este link expirou. Solicite um novo link de acesso.'}</p>
      </div>
    );
  }

  const isSimples = data.regime === 'simples_nacional';

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 bg-primary text-primary-foreground rounded-xl px-5 py-4">
          <Building2 className="w-6 h-6 flex-shrink-0" />
          <div>
            <h1 className="text-lg font-bold">{data.empresa.nome}</h1>
            <p className="text-xs opacity-80">CNPJ: {data.empresa.cnpj} · Período: {data.empresa.periodo}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border p-4 bg-card">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{kpi.label}</p>
              <p className="text-xl font-bold">{kpi.isPercent ? formatPercent(kpi.valor) : formatBRL(kpi.valor)}</p>
              {kpi.extra && <p className="text-xs text-muted-foreground mt-1">{kpi.extra}</p>}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Faturamento Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.faturamento_mensal} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={90} tickFormatter={(v) => formatBRL(v)} />
                <Tooltip formatter={(value) => formatBRL(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="compras" name="Compras" fill={COLORS.compras} radius={[6, 6, 0, 0]} />
                <Bar dataKey="vendas" name="Vendas" fill={COLORS.vendas} radius={[6, 6, 0, 0]} />
                <Bar dataKey="servicos" name="Serviços" fill={COLORS.servicos} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {isSimples ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Imposto</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={data.impostos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={90} tickFormatter={(v) => formatBRL(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#f97316' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatPercent(v)} />
                  <Tooltip formatter={(value, name) => name === 'Alíquota Efetiva' ? formatPercent(value) : formatBRL(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar yAxisId="left" dataKey="valor" name="Simples Nacional" fill={COLORS.imposto} radius={[6, 6, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="aliquota" name="Alíquota Efetiva" stroke={COLORS.aliquota} strokeWidth={2} dot={{ fill: COLORS.aliquota, r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">ICMS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Débito</p>
                  <p className="text-lg font-bold">{formatBRL(data.icms?.debito)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Crédito</p>
                  <p className="text-lg font-bold">{formatBRL(data.icms?.credito)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="text-lg font-bold">{formatBRL(data.icms?.saldo)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}