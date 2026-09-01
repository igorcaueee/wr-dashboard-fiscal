const MESES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function periodoParaMesAbbr(periodo) {
  const [mm, yyyy] = periodo.split('/');
  const idx = parseInt(mm, 10) - 1;
  return `${MESES_ABBR[idx] || mm}/${yyyy}`;
}

export function ordenarPorPeriodo(lista) {
  return [...lista].sort((a, b) => {
    const [ma, ya] = a.periodo.split('/').map(Number);
    const [mb, yb] = b.periodo.split('/').map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });
}

// Constrói o payload do dashboard (KPIs, séries de gráficos) para uma empresa,
// de acordo com o regime tributário. Usado tanto pela rota autenticada por API key
// quanto pela rota pública de compartilhamento.
export async function buildDashboardPayload(base44, empresa) {
  const regime = empresa.regime_tributario;

  if (regime === 'simples_nacional') {
    const apuracoesRaw = await base44.asServiceRole.entities.Apuracao.filter({ empresa_id: empresa.id });
    const apuracoes = ordenarPorPeriodo(apuracoesRaw.filter((a) => a.periodo));

    if (apuracoes.length === 0) {
      return { error: 'Nenhuma apuração encontrada para esta empresa', status: 404 };
    }

    const ultima = apuracoes[apuracoes.length - 1];
    const primeira = apuracoes[0];
    const periodoLabel = apuracoes.length > 1
      ? `${periodoParaMesAbbr(primeira.periodo)} a ${periodoParaMesAbbr(ultima.periodo)}`
      : periodoParaMesAbbr(ultima.periodo);

    const faturamentoTotal = apuracoes.reduce((s, a) => s + (a.receita_bruta_periodo || 0), 0);

    const kpis = [
      { label: 'RBT12', valor: ultima.receita_bruta_acumulada_12m || 0 },
      { label: 'SIMPLES A RECOLHER', valor: ultima.simples_nacional_total || 0 },
      { label: 'ALÍQUOTA EFETIVA', valor: ultima.aliquota_efetiva || 0, isPercent: true },
      { label: 'FATURAMENTO TOTAL', valor: faturamentoTotal, extra: `De ${periodoParaMesAbbr(primeira.periodo)} a ${periodoParaMesAbbr(ultima.periodo)}` },
    ];

    const faturamento_mensal = apuracoes.map((a) => ({
      mes: periodoParaMesAbbr(a.periodo),
      compras: a.total_entradas || 0,
      vendas: a.receita_bruta_periodo || 0,
      servicos: a.total_servicos || 0,
    }));

    const impostos = apuracoes.map((a) => ({
      mes: periodoParaMesAbbr(a.periodo),
      valor: a.simples_nacional_total || 0,
      aliquota: a.aliquota_efetiva || 0,
    }));

    const rbt12 = {
      valor: ultima.receita_bruta_acumulada_12m || 0,
      referencia: `RBT12 do período ${ultima.periodo}`,
      faixa: ultima.faixa_enquadramento || '',
    };

    return {
      data: {
        regime,
        empresa: {
          nome: empresa.nome,
          cnpj: empresa.cnpj,
          inicio_atividades: empresa.inicio_atividades || '',
          tipo_empresa: empresa.tipo_empresa || 'somente_servico',
          periodo: periodoLabel,
        },
        kpis,
        faturamento_mensal,
        rbt12,
        impostos,
        apuracoes,
      },
    };
  }

  if (regime === 'lucro_presumido') {
    const apuracoesRaw = await base44.asServiceRole.entities.ApuracaoLucroPresumido.filter({ empresa_id: empresa.id });
    const apuracoes = ordenarPorPeriodo(apuracoesRaw.filter((a) => a.periodo));

    if (apuracoes.length === 0) {
      return { error: 'Nenhuma apuração encontrada para esta empresa', status: 404 };
    }

    const ultima = apuracoes[apuracoes.length - 1];
    const primeira = apuracoes[0];
    const periodoLabel = apuracoes.length > 1
      ? `${periodoParaMesAbbr(primeira.periodo)} a ${periodoParaMesAbbr(ultima.periodo)}`
      : periodoParaMesAbbr(ultima.periodo);

    const totalCompras = apuracoes.reduce((s, a) => s + (a.total_compras || 0), 0);
    const totalVendas = apuracoes.reduce((s, a) => s + (a.total_vendas || 0), 0);
    const totalServicos = apuracoes.reduce((s, a) => s + (a.total_servicos_prestados || 0), 0);

    const kpis = [
      { label: 'COMPRAS', valor: totalCompras },
      { label: 'FATURAMENTO', valor: totalVendas, extra: `De ${periodoParaMesAbbr(primeira.periodo)} a ${periodoParaMesAbbr(ultima.periodo)}` },
      { label: 'SERVIÇOS PRESTADOS', valor: totalServicos },
      { label: 'ICMS', valor: ultima.icms_saldo || 0 },
      { label: 'PIS', valor: ultima.pis_saldo || 0 },
      { label: 'COFINS', valor: ultima.cofins_saldo || 0 },
    ];

    const faturamento_mensal = apuracoes.map((a) => ({
      mes: periodoParaMesAbbr(a.periodo),
      compras: a.total_compras || 0,
      vendas: a.total_vendas || 0,
      servicos: a.total_servicos_prestados || 0,
    }));

    const icms = {
      debito: ultima.icms_debito || 0,
      credito: ultima.icms_credito || 0,
      saldo: ultima.icms_saldo || 0,
      evolucao: apuracoes.map((a) => ({ mes: a.periodo, valor: a.icms_saldo || 0 })),
    };

    return {
      data: {
        regime,
        empresa: {
          nome: empresa.nome,
          cnpj: empresa.cnpj,
          inicio_atividades: empresa.inicio_atividades || '',
          periodo: periodoLabel,
        },
        kpis,
        faturamento_mensal,
        icms,
      },
    };
  }

  return { error: `Regime tributário "${regime}" não suportado`, status: 400 };
}