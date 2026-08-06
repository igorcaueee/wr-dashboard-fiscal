// Parser do SPED EFD ICMS/IPI (arquivo .txt)
// Retorna dados estruturados a partir das linhas do arquivo

function parseBR(val) {
  if (!val || val === '' || val === '0') return 0;
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
}

export function parseSpedICMS(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  
  const result = {
    cnpj: null,
    nome_empresa: null,
    periodo: null,
    total_compras: 0,
    qtd_notas_compras: 0,
    total_vendas: 0,
    qtd_notas_vendas: 0,
    icms_base_calculo: 0,
    icms_debito: 0,
    icms_credito: 0,
    icms_ajustes_debito: 0,
    icms_ajustes_credito: 0,
    icms_saldo: 0,
    vendas_por_cfop: [],
    compras_por_cfop: [],
    top_clientes: {},
    top_fornecedores: {},
    icms_creditos_por_origem: [],
    cst_icms_dist: [],
    vendas_por_uf: {},
    ncm_map: {},
  };

  // Mapa de participantes 0150
  const participantes = {};

  // Acumuladores por CFOP
  const cfopVendas = {};
  const cfopCompras = {};
  const cstMap = {}; // CST ICMS

  for (const line of lines) {
    const fields = line.split('|');
    // fields[0] = '', fields[1] = registro, fields[2..] = dados
    const reg = fields[1];

    if (reg === '0000') {
      // |0000|versao|tipo_escr|dt_ini|dt_fin|nome|cnpj|...
      const dtIni = fields[4]; // ddmmyyyy
      const dtFin = fields[5];
      result.nome_empresa = fields[6] || null;
      result.cnpj = fields[7] ? fields[7].replace(/\D/g, '') : null;
      if (dtFin && dtFin.length === 8) {
        result.periodo = `${dtFin.slice(2, 4)}/${dtFin.slice(4, 8)}`;
      } else if (dtIni && dtIni.length === 8) {
        result.periodo = `${dtIni.slice(2, 4)}/${dtIni.slice(4, 8)}`;
      }
    }

    if (reg === '0150') {
      // |0150|cod_part|nome|cod_pais|cnpj|cpf|...
      const codPart = fields[2];
      const nome = fields[3];
      const cnpjPart = fields[5] ? fields[5].replace(/\D/g, '') : '';
      participantes[codPart] = { nome, cnpj: cnpjPart };
    }

    if (reg === 'C100') {
      // |C100|ind_oper|ind_emit|cod_part|mod|cod_sit|serie|num_doc|chv_nfe|dt_doc|dt_e_s|vl_doc|...
      const ind_oper = fields[2]; // 0=entrada, 1=saída
      const ind_emit = fields[3]; // 0=emissão própria, 1=terceiros
      const cod_sit = fields[6]; // 00=normal, 02=cancelada
      if (cod_sit === '02' || cod_sit === '01') continue; // canceladas
      const vl_doc = parseBR(fields[12]);
      if (vl_doc <= 0) continue;

      const cod_part = fields[4];
      const participante = participantes[cod_part] || { nome: cod_part, cnpj: '' };

      if (ind_oper === '0') {
        // Compra / entrada
        result.total_compras += vl_doc;
        result.qtd_notas_compras += 1;
        // Acumula por fornecedor
        const key = cod_part;
        if (!result.top_fornecedores[key]) {
          result.top_fornecedores[key] = { nome: participante.nome, cnpj_cpf: participante.cnpj, valor: 0, credito_icms: 0, qtd_notas: 0 };
        }
        result.top_fornecedores[key].valor += vl_doc;
        result.top_fornecedores[key].qtd_notas += 1;
      } else if (ind_oper === '1') {
        // Venda / saída
        result.total_vendas += vl_doc;
        result.qtd_notas_vendas += 1;
        // Acumula por cliente
        const key = cod_part;
        if (!result.top_clientes[key]) {
          result.top_clientes[key] = { nome: participante.nome, cnpj_cpf: participante.cnpj, valor: 0, qtd_notas: 0 };
        }
        result.top_clientes[key].valor += vl_doc;
        result.top_clientes[key].qtd_notas += 1;
      }
    }

    if (reg === 'C190') {
      // |C190|cst_icms|cfop|aliq_icms|vl_opr|vl_bc_icms|vl_icms|vl_bc_icms_st|vl_icms_st|vl_red_bc|vl_icms|cod_obs
      // Precisa do contexto do C100 pai — usamos E510 que é mais simples e correto
    }

    if (reg === 'E110') {
      // |E110|vl_tot_debitos|vl_aj_debitos|vl_tot_aj_debitos|vl_estornos_cred|vl_tot_creditos|vl_aj_creditos|vl_tot_aj_creditos|vl_estornos_deb|vl_sld_credor_ant|vl_sld_apurado|vl_tot_ded|vl_icms_recolher|vl_sld_credor_transp|deb_esp
      result.icms_debito = parseBR(fields[2]);
      result.icms_ajustes_debito = parseBR(fields[3]);
      result.icms_credito = parseBR(fields[6]);
      result.icms_ajustes_credito = parseBR(fields[7]);
      result.icms_saldo = parseBR(fields[11]); // vl_icms_recolher ou saldo credor
      // saldo: positivo = devedor, negativo = credor (usamos sld_apurado)
      const sldApurado = parseBR(fields[10]);
      const sldCredorTransp = parseBR(fields[13]);
      // Se saldo apurado > 0 é devedor, saldo credor transportado = credor
      result.icms_saldo = sldApurado > 0 ? sldApurado : -sldCredorTransp;
    }

    if (reg === 'E510') {
      // |E510|cfop|cst_icms|vl_tot_itens|vl_bc_icms|vl_icms
      const cfop = fields[2];
      const cst = fields[3];
      const vl = parseBR(fields[4]);
      const vl_icms = parseBR(fields[6]);

      // Detecta se é saída (5xxx/6xxx) ou entrada (1xxx/2xxx)
      const cfopNum = parseInt(cfop);
      if (cfopNum >= 5000) {
        // Saída
        if (!cfopVendas[cfop]) cfopVendas[cfop] = { cfop, valor: 0, qtd_notas: 0 };
        cfopVendas[cfop].valor += vl;
      } else if (cfopNum >= 1000) {
        // Entrada
        if (!cfopCompras[cfop]) cfopCompras[cfop] = { cfop, valor: 0, credito_icms: 0 };
        cfopCompras[cfop].valor += vl;
        cfopCompras[cfop].credito_icms += vl_icms;
      }

      // CST ICMS
      if (cst) {
        if (!cstMap[cst]) cstMap[cst] = 0;
        cstMap[cst] += vl;
      }
    }

    if (reg === 'E115') {
      // |E115|cod_inf|vl_inf|descr_compl
      // Créditos especiais (energia, imobilizado, fretes etc.)
      const cod = fields[2];
      const vl = parseBR(fields[3]);
      if (vl > 0) {
        // Tentativa de identificar origem pelo código
        let origem = cod;
        if (cod.includes('032') || cod.includes('033')) origem = 'Energia';
        else if (cod.includes('051') || cod.includes('052')) origem = 'Entradas';
        else if (cod.includes('007') || cod.includes('008')) origem = 'Imobilizado';
        result.icms_creditos_por_origem.push({ origem, valor: vl, codigo: cod });
      }
    }
  }

  // Calcular base de cálculo a partir dos débitos e créditos
  result.icms_base_calculo = result.icms_debito + result.icms_credito;

  // Converter acumuladores para arrays ordenados
  result.vendas_por_cfop = Object.values(cfopVendas)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  result.compras_por_cfop = Object.values(cfopCompras)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  result.top_clientes = Object.values(result.top_clientes)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  result.top_fornecedores = Object.values(result.top_fornecedores)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  result.cst_icms_dist = Object.entries(cstMap)
    .map(([cst, valor]) => ({ cst, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // Consolidar créditos por origem (agrupar por origem)
  const origensMap = {};
  for (const item of result.icms_creditos_por_origem) {
    if (!origensMap[item.origem]) origensMap[item.origem] = 0;
    origensMap[item.origem] += item.valor;
  }
  result.icms_creditos_por_origem = Object.entries(origensMap)
    .map(([origem, valor]) => ({ origem, valor }))
    .sort((a, b) => b.valor - a.valor);

  return result;
}