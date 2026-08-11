// Parser do SPED EFD Contribuições PIS/COFINS (arquivo .txt)

function parseBR(val) {
  if (!val || val === '' || val === '0') return 0;
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
}

export function parseSpedPISCOFINS(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));

  const result = {
    cnpj: null,
    nome_empresa: null,
    periodo: null,
    pis_receita_bruta: 0,
    pis_base_credito: 0,
    pis_base_debito: 0,
    pis_credito: 0,
    pis_debito: 0,
    pis_saldo: 0,
    cofins_receita_bruta: 0,
    cofins_base_credito: 0,
    cofins_base_debito: 0,
    cofins_credito: 0,
    cofins_debito: 0,
    cofins_saldo: 0,
    cst_pis_dist: {},
    cst_cofins_dist: {},
    cfop_receita: {},
    ncm_map: {},
  };

  for (const line of lines) {
    const fields = line.split('|');
    const reg = fields[1];

    if (reg === '0000') {
      const dtFin = fields[6]; // ddmmyyyy
      const dtIni = fields[5];
      result.nome_empresa = fields[8] || null;
      result.cnpj = fields[9] ? fields[9].replace(/\D/g, '') : null;
      const dt = dtFin && dtFin.length === 8 ? dtFin : dtIni;
      if (dt && dt.length === 8) {
        result.periodo = `${dt.slice(2, 4)}/${dt.slice(4, 8)}`;
      }
    }

    if (reg === 'F500') {
      // |F500|vl_rec|cst_pis|vl_exc_pis|vl_bc_pis|aliq_pis|vl_pis|cst_cofins|vl_exc_cofins|vl_bc_cofins|aliq_cofins|vl_cofins|...
      const vl_rec = parseBR(fields[2]);
      const cst_pis = fields[3];
      const vl_bc_pis = parseBR(fields[5]);
      const vl_pis = parseBR(fields[7]);
      const cst_cofins = fields[8];
      const vl_bc_cofins = parseBR(fields[10]);
      const vl_cofins = parseBR(fields[12]);

      result.pis_receita_bruta += vl_rec;
      result.cofins_receita_bruta += vl_rec;

      // CST PIS
      if (cst_pis) {
        if (!result.cst_pis_dist[cst_pis]) result.cst_pis_dist[cst_pis] = 0;
        result.cst_pis_dist[cst_pis] += vl_rec;
      }
      // CST COFINS
      if (cst_cofins) {
        if (!result.cst_cofins_dist[cst_cofins]) result.cst_cofins_dist[cst_cofins] = 0;
        result.cst_cofins_dist[cst_cofins] += vl_rec;
      }
    }

    if (reg === 'M210') {
      // |M210|cod_cont|vl_rec_brt|vl_bc_cont|vl_ajus_acres_rec|vl_ajus_red_rec|vl_bc_cont_aj|aliq_pis|quant_bc_cont|aliq_pis_quant|vl_cont_apur|vl_ajus_acres|vl_ajus_red|vl_cont_dif|vl_cont_dif_ant|vl_cont_per
      // Pode haver múltiplas linhas M210 (uma por código de contribuição) — somar todas.
      // Usa vl_cont_per (valor devido no período já com os ajustes de acréscimo/redução
      // aplicados, ex: reduções de benefícios fiscais), e não vl_cont_apur (valor antes dos ajustes).
      result.pis_base_debito += parseBR(fields[4]); // vl_bc_cont
      result.pis_debito += parseBR(fields[16]);      // vl_cont_per
    }

    if (reg === 'M610') {
      result.cofins_base_debito += parseBR(fields[4]);
      result.cofins_debito += parseBR(fields[16]);   // vl_cont_per
    }

    if (reg === '1900') {
      // |1900|cnpj|mod|cfop|serie|sub_serie|vl_doc|cst_pis|cst_cofins|info_compl|cod_cta
      const cfop = fields[10];
      const vl = parseBR(fields[7]);
      if (cfop && vl > 0) {
        if (!result.cfop_receita[cfop]) result.cfop_receita[cfop] = 0;
        result.cfop_receita[cfop] += vl;
      }
    }
  }

  // Calcular saldos
  result.pis_saldo = result.pis_debito - result.pis_credito;
  result.cofins_saldo = result.cofins_debito - result.cofins_credito;

  // Converter CST para arrays
  result.cst_pis_dist = Object.entries(result.cst_pis_dist)
    .map(([cst, valor]) => ({ cst, valor }))
    .sort((a, b) => b.valor - a.valor);

  result.cst_cofins_dist = Object.entries(result.cst_cofins_dist)
    .map(([cst, valor]) => ({ cst, valor }))
    .sort((a, b) => b.valor - a.valor);

  result.cfop_receita = Object.entries(result.cfop_receita)
    .map(([cfop, valor]) => ({ cfop, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  return result;
}