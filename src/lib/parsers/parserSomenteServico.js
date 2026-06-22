// Parser para empresas do tipo "somente_servico"
// Extrai apenas Anexo III (serviços) do Simples Nacional
import * as XLSX from 'xlsx';
import {
  extractCellValue, normalizeStr,
  extractHeaderInfo, extractReceitas, extractFaixaFator,
  extractSimplesTotal, extractPartilha, extractHistorico12m,
} from './utils';

export function parse(workbook) {
  const sheet = workbook.Sheets['Simples Nacional'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Aba "Simples Nacional" não encontrada.');

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {};

  // Cabeçalho
  Object.assign(result, extractHeaderInfo(sheet));

  // Receitas
  Object.assign(result, extractReceitas(sheet));

  // Faixa e Fator R
  Object.assign(result, extractFaixaFator(sheet));

  // Seções — somente Anexo III (serviços)
  // Anexo e Seção podem vir em linhas separadas no relatório Domínio; rastreamos estado entre linhas
  let currentSection = null;
  for (let r = 0; r <= range.e.r; r++) {
    for (const checkCol of [0, 4]) {
      const val = extractCellValue(sheet, r, checkCol);
      if (!val) continue;
      const nv = normalizeStr(String(val));
      if (nv.includes('anexo iii')) currentSection = 'servicos';
    }
    const label0 = extractCellValue(sheet, r, 0);
    if (label0 && normalizeStr(String(label0)).includes('receita tributada total')) {
      const valor = extractCellValue(sheet, r, 12);
      if (typeof valor === 'number') {
        if (currentSection === 'servicos') result.total_servicos = (result.total_servicos || 0) + valor;
      }
    }
  }

  // Totais
  const simplesTotal = extractSimplesTotal(sheet);
  result.simples_nacional_total = simplesTotal;

  if (simplesTotal && result.receita_bruta_periodo && result.receita_bruta_periodo > 0) {
    result.aliquota_efetiva = (simplesTotal / result.receita_bruta_periodo) * 100;
  }

  // Partilha
  Object.assign(result, extractPartilha(sheet));

  // Histórico 12m
  if (workbook.Sheets['Anexo']) {
    result.historico_12m = extractHistorico12m(workbook.Sheets['Anexo']);
  }

  // Valores padrão para campos não aplicáveis
  result.total_saidas_sem_st = 0;
  result.total_saidas_st = 0;
  result.total_entradas = 0;
  result.base_calculo_icms_entradas = 0;
  result.valor_icms_entradas = 0;

  return result;
}