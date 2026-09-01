import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildDashboardPayload } from '../../shared/fiscalDashboardData.ts';

// Rota pública somente-leitura: retorna os dados do dashboard de UMA única empresa,
// identificada exclusivamente pelo token de compartilhamento (não pelo id sequencial).
// Não exige login. Não expõe listas de empresas nem qualquer operação de escrita.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const url = new URL(req.url);
    let token = url.searchParams.get('token') || '';
    if (!token) {
      try {
        const body = await req.json();
        token = body?.token || '';
      } catch (e) {
        // sem corpo JSON (ex: requisição GET) - segue com token vazio
      }
    }
    if (!token) {
      return Response.json({ error: 'Token é obrigatório' }, { status: 400 });
    }

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ share_token: token });
    const empresa = empresas[0];
    if (!empresa) {
      return Response.json({ error: 'Link inválido' }, { status: 404 });
    }

    if (!empresa.share_token_expires_at || new Date(empresa.share_token_expires_at) < new Date()) {
      return Response.json({
        error: 'expired',
        message: 'Este link expirou. Solicite um novo link de acesso.',
      }, { status: 410 });
    }

    const result = await buildDashboardPayload(base44, empresa);
    if (result.error) {
      return Response.json({ error: result.error }, { status: result.status || 400 });
    }

    return Response.json(result.data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}