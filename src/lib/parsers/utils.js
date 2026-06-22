// Utilitários compartilhados entre os parsers do ERP Domínio
import * as XLSX from 'xlsx';

export function normalizeStr(s) {
  if (!s) return '';
  return String(s).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function extractCellValue(sheet, row, col) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  return cell ? cell.v : null;
}

export function findRowByLabel(sheet, label, colIndex = 0) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const normalizedTarget = normalizeStr(label);
  for (let r = 0; r <= range.e.r; r++) {
    const cellValue = extractCellValue(sheet, r, colIndex);
    if (cellValue && normalizeStr(String(cellValue)).includes(normalizedTarget)) {
      return r;
    }
  }
  return -1;
}

export function findValueNearLabel(sheet, labelRow, range) {
  for (let r = labelRow; r <= Math.min(labelRow + 2, range.e.r); r++) {
    let best = null;
    for (let c = range.e.c; c >= 1; c--) {
      const v = extractCellValue(sheet, r, c);
      if (typeof v === 'number' && v > 0 && (best === null || c > best.c)) {
        best = { c, v };
      }
    }
    if (best) return best.v;
  }
  return null;
}

export function findColumnByHeader(sheet, headerRow, searchLabels) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let c = 0; c <= range.e.c; c++) {
    const val = extractCellValue(sheet, headerRow, c);
    if (val) {
      const n = normalizeStr(String(val));
      for (const label of searchLabels) {
        if (n.includes(normalizeStr(label))) return c;
      }
    }
  }
  return -1;
}

export function excelSerialToDate(serial) {
  if (!serial && serial !== 0) return null;
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 86400000;
  let days = parseInt(serial);
  if (days > 60) days -= 2;
  return new Date(excelEpoch.getTime() + days * msPerDay);
}

export function extractHeaderInfo(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {};

  // Find "Empresa:" cell
  let empresaCell = null;
  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val === 'Empresa:' || normalizeStr(String(val)).includes('empresa:')) {
        empresaCell = { r, c };
        break;
      }
    }
    if (empresaCell) break;
  }

  if (empresaCell) {
    for (let rr = empresaCell.r; rr <= Math.min(empresaCell.r + 8, range.e.r); rr++) {
      const label = extractCellValue(sheet, rr, empresaCell.c);
      if (!label) continue;
      let value = null;
      for (let cc = empresaCell.c + 1; cc <= Math.min(empresaCell.c + 20, range.e.c); cc++) {
        const v = extractCellValue(sheet, rr, cc);
        if (v !== null && v !== undefined && v !== '') {
          value = v;
          break;
        }
      }

      const nl = normalizeStr(String(label));
      if (nl.includes('cnpj')) {
        result._cnpj = value ? String(value).replace(/\D/g, '') : null;
      }
      if (nl.includes('periodo') || nl.includes('período')) {
        if (typeof value === 'number') {
          result._periodo = value;
        } else if (typeof value === 'string') {
          const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) result._periodoRaw = `${match[2]}/${match[3]}`;
        }
      }
    }
  }

  // Converter periodo serial para MM/YYYY
  if (result._periodoRaw) {
    result.periodo = result._periodoRaw;
  } else if (result._periodo !== undefined && result._periodo !== null) {
    const d = excelSerialToDate(result._periodo);
    if (d) {
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      result.periodo = `${mes}/${ano}`;
    }
  }

  return result;
}

export function extractReceitas(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {};

  const rpaRow = findRowByLabel(sheet, 'Receita Bruta do período de Apuração');
  if (rpaRow >= 0) result.receita_bruta_periodo = findValueNearLabel(sheet, rpaRow, range) || 0;

  const rbtRow = findRowByLabel(sheet, 'Receita bruta acumulada nos doze meses anteriores');
  if (rbtRow >= 0) result.receita_bruta_acumulada_12m = findValueNearLabel(sheet, rbtRow, range) || 0;

  const rbaCorrenteRow = findRowByLabel(sheet, 'Receita bruta acumulada no ano-calendário corrente');
  if (rbaCorrenteRow >= 0) result.receita_bruta_ano_corrente = findValueNearLabel(sheet, rbaCorrenteRow, range) || 0;

  const rbaAnteriorRow = findRowByLabel(sheet, 'Receita bruta acumulada no ano-calendário anterior');
  if (rbaAnteriorRow >= 0) result.receita_bruta_ano_anterior = findValueNearLabel(sheet, rbaAnteriorRow, range) || 0;

  return result;
}

export function extractFaixaFator(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {};

  const faixaRow = findRowByLabel(sheet, 'Faixa de Enquadramento');
  if (faixaRow >= 0) {
    // Procura valor no formato brasileiro com separadores de milhar: ex "720.000,01 a 1.800.000,00"
    for (let c = 1; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, faixaRow, c);
      if (val && String(val).match(/[\d.]+,\d+\s+a\s+[\d.]+,\d+/)) {
        result.faixa_enquadramento = String(val);
        break;
      }
    }
  }

  const fatorRow = findRowByLabel(sheet, 'Fator r');
  if (fatorRow >= 0) {
    const label0 = extractCellValue(sheet, fatorRow, 0);
    if (label0) {
      const match = String(label0).match(/([\d,.]+)/);
      if (match) {
        const num = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(num)) result.fator_r = num;
      }
    }
    if (result.fator_r === undefined) {
      for (let c = 1; c <= range.e.c; c++) {
        const val = extractCellValue(sheet, fatorRow, c);
        if (typeof val === 'number') { result.fator_r = val; break; }
      }
    }
  }

  return result;
}

export function extractSimplesTotal(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const simplesRow = findRowByLabel(sheet, 'Simples Nacional a recolher');
  if (simplesRow >= 0) {
    for (let c = range.e.c; c >= 1; c--) {
      const val = extractCellValue(sheet, simplesRow, c);
      if (typeof val === 'number' && val > 0) return val;
    }
  }
  return 0;
}

export function extractPartilha(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {
    valor_irpj: 0, valor_csll: 0, valor_cofins: 0,
    valor_pis: 0, valor_cpp: 0, valor_icms: 0, valor_iss: 0,
  };

  // Encontra a primeira linha de partilha
  let partilhaStart = -1;
  for (let r = 0; r <= range.e.r; r++) {
    const val = extractCellValue(sheet, r, 0);
    if (val && normalizeStr(String(val)).includes('partilha')) {
      partilhaStart = r;
      break;
    }
  }
  if (partilhaStart < 0) return result;

  // Mapeia colunas de impostos — varre linhas da partilha até achar todos
  const colMap = {};
  for (let r = partilhaStart; r <= Math.min(partilhaStart + 5, range.e.r); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (!val) continue;
      const nv = normalizeStr(String(val));
      if (colMap.irpj === undefined && (nv.includes('irpj') || nv === 'irpj')) colMap.irpj = c;
      if (colMap.csll === undefined && (nv.includes('csll') || nv === 'csll')) colMap.csll = c;
      if (colMap.cofins === undefined && nv.includes('cofins')) colMap.cofins = c;
      if (colMap.pis === undefined && (nv.includes('pis') || nv === 'pis/pasep')) colMap.pis = c;
      if (colMap.cpp === undefined && (nv.includes('cpp') || nv.includes('inss') || nv.includes('previdenci'))) colMap.cpp = c;
      if (colMap.icms === undefined && nv === 'icms') colMap.icms = c;
      if (colMap.iss === undefined && (nv.includes('iss') || nv === 'issqn')) colMap.iss = c;
    }
  }

  // Percorre linhas de valor e acumula
  for (let r = partilhaStart + 2; r <= Math.min(range.e.r, partilhaStart + 50); r++) {
    const rowLabel = extractCellValue(sheet, r, 0);
    const nl = rowLabel ? normalizeStr(String(rowLabel)) : '';
    // Para ao encontrar totais ou fim da seção de partilha
    if (nl.includes('total') || nl.includes('simples nacional') || nl.includes('sistema licenciado')) break;

    // Procura célula "Valor:" em qualquer coluna desta linha
    let isValueRow = false;
    for (let c = 0; c <= range.e.c; c++) {
      const v = extractCellValue(sheet, r, c);
      if (v && normalizeStr(String(v)) === 'valor:') { isValueRow = true; break; }
    }
    if (!isValueRow) continue;

    // Acumula valores de cada imposto mapeado
    if (colMap.irpj !== undefined) { const v = extractCellValue(sheet, r, colMap.irpj); if (typeof v === 'number') result.valor_irpj += v; }
    if (colMap.csll !== undefined) { const v = extractCellValue(sheet, r, colMap.csll); if (typeof v === 'number') result.valor_csll += v; }
    if (colMap.cofins !== undefined) { const v = extractCellValue(sheet, r, colMap.cofins); if (typeof v === 'number') result.valor_cofins += v; }
    if (colMap.pis !== undefined) { const v = extractCellValue(sheet, r, colMap.pis); if (typeof v === 'number') result.valor_pis += v; }
    if (colMap.cpp !== undefined) { const v = extractCellValue(sheet, r, colMap.cpp); if (typeof v === 'number') result.valor_cpp += v; }
    if (colMap.icms !== undefined) { const v = extractCellValue(sheet, r, colMap.icms); if (typeof v === 'number') result.valor_icms += v; }
    if (colMap.iss !== undefined) { const v = extractCellValue(sheet, r, colMap.iss); if (typeof v === 'number') result.valor_iss += v; }
  }

  return result;
}

export function extractHistorico12m(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const historico = [];

  let headerRow = -1, periodoCol = -1, receitaCol = -1;
  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val && normalizeStr(String(val)).includes('periodo')) { headerRow = r; periodoCol = c; }
      if (val && normalizeStr(String(val)).includes('receita bruta') && !normalizeStr(String(val)).includes('exceto')) {
        if (headerRow === r) receitaCol = c;
      }
    }
    if (headerRow >= 0 && periodoCol >= 0 && receitaCol >= 0) break;
  }

  if (headerRow < 0 || receitaCol < 0) return historico;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const periodoVal = extractCellValue(sheet, r, periodoCol);
    const receitaVal = extractCellValue(sheet, r, receitaCol);
    if (!periodoVal || !receitaVal || typeof receitaVal !== 'number') continue;

    let periodoStr = null;
    if (typeof periodoVal === 'number') {
      const d = excelSerialToDate(periodoVal);
      if (d) periodoStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } else if (typeof periodoVal === 'string') {
      const match = periodoVal.match(/(\d{2})\/(\d{4})/);
      if (match) periodoStr = `${match[1]}/${match[2]}`;
    }
    if (periodoStr && !isNaN(receitaVal)) historico.push({ periodo: periodoStr, receita_bruta: receitaVal });
  }

  return historico;
}

export function parseEntradas(workbook) {
  const sheet = workbook.Sheets['Entradas'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return {};

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {};

  let headerRow = -1;
  for (let r = 0; r <= Math.min(8, range.e.r); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val && normalizeStr(String(val)).includes('valor contabil')) { headerRow = r; break; }
    }
    if (headerRow >= 0) break;
  }
  if (headerRow < 0) return result;

  const colValorContabil = findColumnByHeader(sheet, headerRow, ['valor contabil', 'valor contábil']);
  const colBaseCalculo = findColumnByHeader(sheet, headerRow, ['base calculo', 'base cálculo']);
  const colTipo = findColumnByHeader(sheet, headerRow, ['tipo']);

  // Find standalone "Valor" column — skip "Valor Contábil" which matches first
  let colValor = -1;
  for (let c = 0; c <= range.e.c; c++) {
    if (c === colValorContabil) continue;
    const val = extractCellValue(sheet, headerRow, c);
    if (val && normalizeStr(String(val)).includes('valor') && !normalizeStr(String(val)).includes('contabil')) {
      colValor = c;
      break;
    }
  }

  let totalGeralRow = -1;
  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= Math.min(5, range.e.c); c++) {
      const val = extractCellValue(sheet, r, c);
      if (val && normalizeStr(String(val)) === 'total geral') { totalGeralRow = r; break; }
    }
    if (totalGeralRow >= 0) break;
  }

  if (totalGeralRow >= 0) {
    // Total Geral value may be on the same row or the next rows
    if (colValorContabil >= 0) {
      for (let r = totalGeralRow; r <= Math.min(totalGeralRow + 3, range.e.r); r++) {
        const v = extractCellValue(sheet, r, colValorContabil);
        if (typeof v === 'number') { result.total_entradas = v; break; }
      }
    }
    // Find ICMS base and value in rows after Total Geral
    for (let r = totalGeralRow; r <= Math.min(totalGeralRow + 4, range.e.r); r++) {
      const label = extractCellValue(sheet, r, 0);
      const tipoVal = extractCellValue(sheet, r, colTipo >= 0 ? colTipo : 1);
      const isICMS = (label && normalizeStr(String(label)).includes('icms')) ||
        (tipoVal && normalizeStr(String(tipoVal)).includes('icms'));
      if (isICMS) {
        if (colBaseCalculo >= 0 && result.base_calculo_icms_entradas === undefined) {
          const v = extractCellValue(sheet, r, colBaseCalculo);
          if (typeof v === 'number') result.base_calculo_icms_entradas = v;
        }
        if (colValor >= 0 && result.valor_icms_entradas === undefined) {
          const v = extractCellValue(sheet, r, colValor);
          if (typeof v === 'number') result.valor_icms_entradas = v;
        }
      }
    }
  } else {
    let cfopTotal = 0;
    const colInfoRow = findColumnByHeader(sheet, headerRow, ['cfop']);
    for (let r = headerRow; r <= range.e.r; r++) {
      const label = String(extractCellValue(sheet, r, colInfoRow >= 0 ? colInfoRow : 0) || '');
      if (label.toUpperCase().startsWith('CFOP:')) {
        if (r + 1 < range.e.r && colValorContabil >= 0) {
          const v = extractCellValue(sheet, r + 1, colValorContabil);
          if (typeof v === 'number') cfopTotal += v;
        }
      }
    }
    result.total_entradas = Math.round(cfopTotal * 100) / 100;

    let icmsBase = 0, icmsValor = 0;
    for (let r = headerRow; r <= range.e.r; r++) {
      const tipoStr = String(extractCellValue(sheet, r, colTipo >= 0 ? colTipo : 7) || '').trim().toUpperCase();
      if (tipoStr.includes('ICMS')) {
        if (colBaseCalculo >= 0) { const v = extractCellValue(sheet, r, colBaseCalculo); if (typeof v === 'number') icmsBase += v; }
        if (colValor >= 0) { const v = extractCellValue(sheet, r, colValor); if (typeof v === 'number') icmsValor += v; }
      }
    }
    result.base_calculo_icms_entradas = Math.round(icmsBase * 100) / 100;
    result.valor_icms_entradas = Math.round(icmsValor * 100) / 100;
  }

  return result;
}