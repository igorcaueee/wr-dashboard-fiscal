import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { buildDashboardPayload } from '../../shared/fiscalDashboardData.ts';

export default async function(req) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== secrets.get('DASHBOARD_API_KEY')) {
      return Response.json({ error: 'Unauthorized: invalid x-api-key' }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);

    const url = new URL(req.url);
    let cnpjRaw = url.searchParams.get('cnpj') || '';
    if (!cnpjRaw) {
      try {
        const body = await req.json();
        cnpjRaw = body?.cnpj || '';
      } catch (e) {
        // sem corpo JSON (ex: requisição GET) - segue com cnpjRaw vazio
      }
    }
    const cnpjNormalizado = cnpjRaw.replace(/\D/g, '');
    if (!cnpjNormalizado) {
      return Response.json({ error: 'CNPJ é obrigatório' }, { status: 400 });
    }

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ cnpj: cnpjNormalizado });
    let empresa = empresas[0];
    if (!empresa) {
      // fallback: cnpj pode estar salvo com máscara
      const todasEmpresas = await base44.asServiceRole.entities.Empresa.list();
      empresa = todasEmpresas.find(e => (e.cnpj || '').replace(/\D/g, '') === cnpjNormalizado);
    }
    if (!empresa) {
      return Response.json({ error: 'Empresa não encontrada para o CNPJ informado' }, { status: 404 });
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