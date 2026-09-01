import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Building2, AlertCircle, Loader2 } from 'lucide-react';
import SimplesNacionalDashboardContent from '@/components/dashboard/SimplesNacionalDashboardContent';
import LucroPresumidoDashboardContent from '@/components/dashboard/LucroPresumidoDashboardContent';

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
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3 bg-primary text-primary-foreground rounded-xl px-5 py-4">
          <Building2 className="w-6 h-6 flex-shrink-0" />
          <div>
            <h1 className="text-lg font-bold">{data.empresa.nome}</h1>
            <p className="text-xs opacity-80">CNPJ: {data.empresa.cnpj} · Período: {data.empresa.periodo}</p>
          </div>
        </div>

        {isSimples ? (
          <SimplesNacionalDashboardContent
            empresa={data.empresa}
            apuracoes={data.apuracoes || []}
          />
        ) : (
          <LucroPresumidoDashboardContent
            empresa={data.empresa}
            apuracoes={data.apuracoes || []}
          />
        )}
      </div>
    </div>
  );
}