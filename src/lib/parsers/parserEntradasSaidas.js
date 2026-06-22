// Parser para empresas do tipo "entradas_saidas"
// Extrai Anexo I (sem ST e com ST) do Simples Nacional + Entradas
import * as XLSX from 'xlsx';
import {
  extractCellValue, normalizeStr,
  extractHeaderInfo, extractReceitas, extractFaixaFator,
  extractSimplesTotal, extractPartilha, extractHistorico12m,
  parseEntradas,
} from './utils';

export function parse(workbookSimples, workbookEntradas) {
  const sheet = workbookSimples.Sheets['Simples Nacional'] || workbookSimples.Sheets[workbookSimples.SheetNames[0]];
  if (!sheet) throw new Error('Aba "Simples Nacional" não encontrada.');

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {};

  // Cabeçalho
  Object.assign(result, extractHeaderInfo(sheet));

  // Receitas
  Object.assign(result, extractReceitas(sheet));

  // Faixa e Fator R
  Object.assign(result, extractFaixaFator(sheet));

  // Seções — Anexo I Seção I (sem ST) e Seção II (com ST)
  // Anexo e Seção vêm em linhas separadas no relatório Domínio; rastreamos estado entre linhas
  const SECAO_I = normalizeStr('seção i');
  const SECAO_II = normalizeStr('seção ii');
  const ANEXO_I = normalizeStr('anexo i');
  const ANEXO_II = normalizeStr('anexo ii');
  const ANEXO_III = normalizeStr('anexo iii');
  const RECEITA_TRIBUTADA = normalizeStr('receita tributada total');
  let currentAnnex = null;
  let currentSection = null;
  for (let r = 0; r <= range.e.r; r++) {
    for (const checkCol of [0, 4]) {
      const val = extractCellValue(sheet, r, checkCol);
      if (!val) continue;
      const nv = normalizeStr(String(val));
      // Rastrear anexo
      if (nv.includes(ANEXO_I) && !nv.includes(ANEXO_II) && !nv.includes(ANEXO_III)) {
        currentAnnex = 'i';
      }
      // Rastrear seção dentro do anexo atual
      if (currentAnnex === 'i') {
        if (nv.includes(SECAO_I) && !nv.includes(SECAO_II)) {
          currentSection = 'sem_st';
        } else if (nv.includes(SECAO_II)) {
          currentSection = 'com_st';
        }
      }
    }
    // Capturar receita da seção atual
    const label0 = extractCellValue(sheet, r, 0);
    if (label0 && normalizeStr(String(label0)).includes(RECEITA_TRIBUTADA)) {
      const valor = extractCellValue(sheet, r, 12);
      if (typeof valor === 'number') {
        if (currentSection === 'sem_st') result.total_saidas_sem_st = (result.total_saidas_sem_st || 0) + valor;
        else if (currentSection === 'com_st') result.total_saidas_st = (result.total_saidas_st || 0) + valor;
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
  if (workbookSimples.Sheets['Anexo']) {
    result.historico_12m = extractHistorico12m(workbookSimples.Sheets['Anexo']);
  }

  // Entradas
  if (workbookEntradas) {
    const entradas = parseEntradas(workbookEntradas);
    result.total_entradas = entradas.total_entradas || 0;
    result.base_calculo_icms_entradas = entradas.base_calculo_icms_entradas || 0;
    result.valor_icms_entradas = entradas.valor_icms_entradas || 0;
  }

  // Valores padrão para campos não aplicáveis
  result.total_servicos = 0;

  return result;
}