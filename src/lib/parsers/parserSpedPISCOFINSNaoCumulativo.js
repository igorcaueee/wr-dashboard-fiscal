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

    // Créditos de PIS — um registro M100 por natureza de crédito (COD_CRED)
    if (reg === 'M100') {
      const cod_cred = fields[2];
      const vl_bc_pis = parseBR(fields[6]);
      const vl_cred_pis = parseBR(fields[10]);
      result.pis_base_credito += vl_bc_pis;
      result.pis_credito += vl_cred_pis;
      if (vl_cred_pis > 0) {
        const natureza = getNaturezaCredito(cod_cred);
        result.pis_creditos_por_natureza[natureza] = (result.pis_creditos_por_natureza[natureza] || 0) + vl_cred_pis;
      }
    }

    // Débitos de PIS sobre as receitas
    if (reg === 'M210') {
      result.pis_base_debito += parseBR(fields[4]);
      result.pis_debito += parseBR(fields[16]); // vl_cont_per — valor devido no período já com ajustes
    }

    // Créditos de COFINS — mesma lógica do M100
    if (reg === 'M500') {
      const cod_cred = fields[2];
      const vl_bc_cofins = parseBR(fields[6]);
      const vl_cred_cofins = parseBR(fields[10]);
      result.cofins_base_credito += vl_bc_cofins;
      result.cofins_credito += vl_cred_cofins;
      if (vl_cred_cofins > 0) {
        const natureza = getNaturezaCredito(cod_cred);
        result.cofins_creditos_por_natureza[natureza] = (result.cofins_creditos_por_natureza[natureza] || 0) + vl_cred_cofins;
      }
    }

    // Débitos de COFINS sobre as receitas
    if (reg === 'M610') {
      result.cofins_base_debito += parseBR(fields[4]);
      result.cofins_debito += parseBR(fields[16]);
    }
  }

  // Saldo a recolher = débito do período - créditos apurados (regime não-cumulativo)
  result.pis_saldo = result.pis_debito - result.pis_credito;
  result.cofins_saldo = result.cofins_debito - result.cofins_credito;

  result.pis_creditos_por_natureza = Object.entries(result.pis_creditos_por_natureza)
    .map(([natureza, valor]) => ({ natureza, valor }))
    .sort((a, b) => b.valor - a.valor);

  result.cofins_creditos_por_natureza = Object.entries(result.cofins_creditos_por_natureza)
    .map(([natureza, valor]) => ({ natureza, valor }))
    .sort((a, b) => b.valor - a.valor);

  return result;
}