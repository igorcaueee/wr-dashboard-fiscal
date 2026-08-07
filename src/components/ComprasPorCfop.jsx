import { getCfopDescricao } from '@/lib/cfop';
import { formatBRL } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ComprasPorCfop({ compras }) {
  if (!compras || compras.length === 0) return null;

  const maxValor = Math.max(...compras.map((c) => c.valor));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Compras por CFOP</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {compras.map((item, idx) => {
            const pct = maxValor > 0 ? (item.valor / maxValor) * 100 : 0;
            const desc = getCfopDescricao(item.cfop);
            return (
              <div key={idx}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-medium text-foreground">
                    {item.cfop}{desc && ` — ${desc}`}
                  </span>
                  <span className="text-sm text-muted-foreground">{formatBRL(item.valor)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: '#7E33A3' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}