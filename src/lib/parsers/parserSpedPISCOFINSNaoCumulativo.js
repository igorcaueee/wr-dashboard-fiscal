// Parser do SPED EFD Contribuições PIS/COFINS — regime NÃO-CUMULATIVO (Lucro Real)
// Diferente do Presumido (cumulativo), este regime apura créditos (M100/M500)
// além dos débitos (M210/M610) sobre as receitas.

function parseBR(val) {
  if (!val || val === '' || val === '0') return 0;
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
}

// Tabela 4.3.6 (PIS, códigos 1xx) e equivalente COFINS (2xx) — naturezas de crédito mais comuns
const NATUREZA_CREDITO = {
  '101': 'Aquisição de Bens para Revenda',
  '102': 'Aquisição de Insumos',
  '103': 'Energia Elétrica e Térmica',
  '104': 'Aluguéis de Prédios',
  '105': 'Aluguéis de Máquinas e Equipamentos',
  '106': 'Armazenagem e Frete na Operação de Venda',
  '107': 'Contraprestações de Arrendamento Mercantil',
  '108': 'Depreciação de Máquinas e Equipamentos',
  '109': 'Depreciação de Edificações e Benfeitorias',
  '110': 'Amortização e Depreciação de Bens',
  '111': 'Devolução de Vendas',
  '199': 'Outras Naturezas de Crédito',
  '201': 'Aquisição de Bens para Revenda',
  '202': 'Aquisição de Insumos',
  '203': 'Energia Elétrica e Térmica',
  '204': 'Aluguéis de Prédios',
  '205': 'Aluguéis de Máquinas e Equipamentos',
  '206': 'Armazenagem e Frete na Operação de Venda',
  '207': 'Contraprestações de Arrendamento Mercantil',
  '208': 'Depreciação de Máquinas e Equipamentos',
  '209': 'Depreciação de Edificações e Benfeitorias',
  '210': 'Amortização e Depreciação de Bens',
  '211': 'Devolução de Vendas',
  '299': 'Outras Naturezas de Crédito',
};

function getNaturezaCredito(cod) {
  if (!cod) return 'Não informado';
  return NATUREZA_CREDITO[cod] || `Outros (código ${cod})`;
}

export function parseSpedPISCOFINSNaoCumulativo(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));

  const result = {
    cnpj: null,
    nome_empresa: null,
    periodo: null,
    pis_receita_bruta: 0,
    pis_base_credito: 0,
    pis_credito: 0,
    pis_base_debito: 0,
    pis_debito: 0,
    pis_saldo: 0,
    cofins_receita_bruta: 0,
    cofins_base_credito: 0,
    cofins_credito: 0,
    cofins_base_debito: 0,
    cofins_debito: 0,
    cofins_saldo: 0,
    total_servicos_prestados: 0,
    pis_creditos_por_natureza: {},
    cofins_creditos_por_natureza: {},
  };

  let temM200 = false;
  let temM600 = false;
  let pisDebitoM210 = 0;
  let pisCreditoM100 = 0;
  let cofinsDebitoM610 = 0;
  let cofinsCreditoM500 = 0;

  for (const line of lines) {
    const fields = line.split('|');
    const reg = fields[1];

    if (reg === '0000') {
      const dtIni = fields[5];
      const dtFin = fields[6];
      result.nome_empresa = fields[8] || null;
      result.cnpj = fields[9] ? fields[9].replace(/\D/g, '') : null;
      const dt = dtFin && dtFin.length === 8 ? dtFin : dtIni;
      if (dt && dt.length === 8) {
        result.periodo = `${dt.slice(2, 4)}/${dt.slice(4, 8)}`;
      }
    }

    if (reg === 'F500') {
      const vl_rec = parseBR(fields[2]);
      result.pis_receita_bruta += vl_rec;
      result.cofins_receita_bruta += vl_rec;
    }

    if (reg === 'F550') {
      // Registros sem CFOP (campo 14) representam receita de prestação de serviços
      const cfop = fields[14];
      if (!cfop) {
        result.total_servicos_prestados += parseBR(fields[2]);
      }
    }

    if (reg === 'A100') {
      // |A100|ind_oper|ind_emit|cod_part|cod_sit|ser|sub|num_doc|chv_nfse|dt_doc|dt_exe_serv|vl_doc|...
      // NF de Serviços (NFS-e) emitida pelo próprio contribuinte (ind_oper=1) — receita
      // de prestação de serviços sujeita a ISS, distinta das notas de venda de mercadoria
      // e dos CT-e (que permanecem em "vendas").
      const ind_oper = fields[2];
      const cod_sit = fields[5];
      if (ind_oper === '1' && cod_sit !== '02') {
        result.total_servicos_prestados += parseBR(fields[12]);
      }
    }

    // Créditos de PIS por natureza — um registro M100 por natureza de crédito (COD_CRED).
    // Usado para o detalhamento por natureza, e como reserva do total de crédito
    // caso o SPED não traga o registro-resumo M200.
    if (reg === 'M100') {
      const cod_cred = fields[2];
      const vl_bc_pis = parseBR(fields[6]);
      const vl_cred_pis = parseBR(fields[10]);
      result.pis_base_credito += vl_bc_pis;
      pisCreditoM100 += vl_cred_pis;
      if (vl_cred_pis > 0) {
        const natureza = getNaturezaCredito(cod_cred);
        result.pis_creditos_por_natureza[natureza] = (result.pis_creditos_por_natureza[natureza] || 0) + vl_cred_pis;
      }
    }

    // Débito de PIS (detalhamento e reserva caso não haja M200)
    if (reg === 'M210') {
      result.pis_base_debito += parseBR(fields[4]);
      pisDebitoM210 += parseBR(fields[16]);
    }

    // Resumo da apuração de PIS do período — fonte oficial de débito/crédito/saldo
    if (reg === 'M200') {
      // |M200|VL_TOT_CONT_NC_PER|VL_TOT_CRED_DESC|VL_TOT_CRED_DESC_ANT|VL_TOT_CONT_NC_DEV|VL_RET_NC|VL_OUT_DED_NC|VL_CONT_NC_REC|VL_TOT_CONT_CUM_PER|VL_RET_CUM|VL_OUT_DED_CUM|VL_CONT_CUM_REC|VL_TOT_CONT_REC|
      result.pis_debito = parseBR(fields[2]);   // Valor Total da Contribuição Não Cumulativa apurada no período
      result.pis_credito = parseBR(fields[3]);  // Valor do Crédito Descontado no período
      result.pis_saldo = parseBR(fields[13]);   // Valor Total da Contribuição a Recolher
      temM200 = true;
    }

    // Créditos de COFINS por natureza — mesma lógica do M100
    if (reg === 'M500') {
      const cod_cred = fields[2];
      const vl_bc_cofins = parseBR(fields[6]);
      const vl_cred_cofins = parseBR(fields[10]);
      result.cofins_base_credito += vl_bc_cofins;
      cofinsCreditoM500 += vl_cred_cofins;
      if (vl_cred_cofins > 0) {
        const natureza = getNaturezaCredito(cod_cred);
        result.cofins_creditos_por_natureza[natureza] = (result.cofins_creditos_por_natureza[natureza] || 0) + vl_cred_cofins;
      }
    }

    // Débito de COFINS (detalhamento e reserva caso não haja M600)
    if (reg === 'M610') {
      result.cofins_base_debito += parseBR(fields[4]);
      cofinsDebitoM610 += parseBR(fields[16]);
    }

    // Resumo da apuração de COFINS do período — fonte oficial de débito/crédito/saldo
    if (reg === 'M600') {
      result.cofins_debito = parseBR(fields[2]);
      result.cofins_credito = parseBR(fields[3]);
      result.cofins_saldo = parseBR(fields[13]);
      temM600 = true;
    }
  }

  // Reserva: se o SPED não trouxer o registro-resumo M200/M600, usa os totais
  // acumulados a partir dos registros de detalhe (M210/M100 e M610/M500).
  if (!temM200) {
    result.pis_debito = pisDebitoM210;
    result.pis_credito = pisCreditoM100;
    result.pis_saldo = pisDebitoM210 - pisCreditoM100;
  }
  if (!temM600) {
    result.cofins_debito = cofinsDebitoM610;
    result.cofins_credito = cofinsCreditoM500;
    result.cofins_saldo = cofinsDebitoM610 - cofinsCreditoM500;
  }

  result.pis_creditos_por_natureza = Object.entries(result.pis_creditos_por_natureza)
    .map(([natureza, valor]) => ({ natureza, valor }))
    .sort((a, b) => b.valor - a.valor);

  result.cofins_creditos_por_natureza = Object.entries(result.cofins_creditos_por_natureza)
    .map(([natureza, valor]) => ({ natureza, valor }))
    .sort((a, b) => b.valor - a.valor);

  return result;
}