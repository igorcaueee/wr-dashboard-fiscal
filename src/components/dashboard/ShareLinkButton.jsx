import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, XCircle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function ShareLinkButton({ empresa, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const hasValidToken = !!(
    empresa?.share_token &&
    empresa?.share_token_expires_at &&
    new Date(empresa.share_token_expires_at) > new Date()
  );

  const handleShare = async () => {
    if (!empresa) return;
    setLoading(true);
    try {
      let token = empresa.share_token;
      let expiresAt = empresa.share_token_expires_at;
      const isValid = token && expiresAt && new Date(expiresAt) > new Date();

      // Gera um novo token se não existir um válido (ou já expirado)
      if (!isValid) {
        token = crypto.randomUUID();
        const now = new Date();
        expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();
        await base44.entities.Empresa.update(empresa.id, {
          share_token: token,
          share_token_created_at: now.toISOString(),
          share_token_expires_at: expiresAt,
        });
        onUpdated?.();
      }

      const url = `${window.location.origin}/dashboard-publico/${token}`;
      const validade = new Date(expiresAt).toLocaleDateString('pt-BR');
      await navigator.clipboard.writeText(`${url}\nVálido até ${validade}`);
      toast({ title: 'Link copiado!', description: `Válido até ${validade}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!empresa) return;
    setLoading(true);
    try {
      await base44.entities.Empresa.update(empresa.id, {
        share_token: '',
        share_token_created_at: '',
        share_token_expires_at: '',
      });
      onUpdated?.();
      toast({ title: 'Link revogado', description: 'O acesso ao link anterior foi invalidado.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" className="gap-2" onClick={handleShare} disabled={loading || !empresa}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
        Compartilhar link
      </Button>
      {hasValidToken && (
        <Button variant="ghost" size="icon" onClick={handleRevoke} disabled={loading} title="Revogar link">
          <XCircle className="w-4 h-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}