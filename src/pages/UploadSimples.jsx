import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

const tipoLabels = {
  somente_servico: 'Somente Prestação de Serviços',
  entradas_saidas: 'Entradas e Saídas (Comércio)',
  entradas_saidas_servicos: 'Entradas, Saídas e Serviços (Comércio + Serviços)',
};

// ---- Helpers de parsing ----

function normalizeStr(s) {
  if (!s) return '';
  return String(s).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractCellValue(sheet, row, col) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  return cell ? cell.v : null;
}

function findRowByLabel(sheet, label, colIndex = 0) {
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

function extractPeriodoFromHeader(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let r = 0; r <= Math.min(range.e.r, 15); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val && (normalizeStr(String(val)).includes('periodo') || normalizeStr(String(val)).includes('período'))) {
        // Value is typically in next column
        const nextVal = extractCellValue(sheet, r, c + 1);
        if (nextVal !== null && nextVal !== undefined) {
          if (typeof nextVal === 'number') {
            return nextVal;
          }
          if (typeof nextVal === 'string' && nextVal.match(/\d{4}-\d{2}-\d{2}/)) {
            const d = new Date(nextVal + 'T00:00:00');
            const excelEpoch = new Date(1899, 11, 30);
            return Math.round((d - excelEpoch) / 86400000) - 1;
          }
        }
      }
    }
  }
  return null;
}

function findColumnByHeader(sheet, headerRow, searchLabels) {
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

function parseSimplesNacional(workbook) {
  const sheet = workbook.Sheets['Simples Nacional'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Aba "Simples Nacional" não encontrada no arquivo.');

  const range = XLSX.utils.decode_range(sheet['!ref']);
  let input = null;
  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val === 'Empresa:' || normalizeStr(String(val)).includes('empresa:')) {
        input = { sheet, range, empresaCell: { r, c } };
        break;
      }
    }
    if (input) break;
  }

  const result = {};

  // Extrair cabeçalho: nome, cnpj, periodo, inicio_atividades
  if (input) {
    const { sheet: s, empresaCell } = input;
    for (let rr = empresaCell.r; rr <= Math.min(empresaCell.r + 6, range.e.r); rr++) {
      const label = extractCellValue(s, rr, empresaCell.c);
      const value = extractCellValue(s, rr, empresaCell.c + 1);
      if (!label) continue;
      const nl = normalizeStr(String(label));
      if (nl.includes('cnpj')) {
        result._cnpj = value ? String(value).replace(/\D/g, '') : null;
      }
      if (nl.includes('periodo') || nl.includes('período')) {
        if (typeof value === 'number') {
          result._periodo = value;
        } else if (typeof value === 'string') {
          const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) {
            result._periodoRaw = `${match[2]}/${match[3]}`;
          }
        }
      }
      if (nl.includes('inicio das atividades') || nl.includes('início das atividades')) {
        if (typeof value === 'number') {
          result._inicioAtividades = value;
        }
      }
    }
  } else {
    // Try scanning whole sheet
    const s = sheet;
    result._periodo = extractPeriodoFromHeader(s);
  }

  // Extrair receitas procurando por labels específicos
  const rpaRow = findRowByLabel(sheet, 'Receita Bruta do período de Apuração');
  if (rpaRow >= 0) {
    const totalCol = findColumnByHeader(sheet, rpaRow, ['total']);
    if (totalCol >= 0) {
      const val = extractCellValue(sheet, rpaRow, totalCol);
      if (val !== null && val !== undefined) result.receita_bruta_periodo = val;
    }
  }

  const rbtRow = findRowByLabel(sheet, 'Receita bruta acumulada nos doze meses anteriores');
  if (rbtRow >= 0) {
    const totalCol = findColumnByHeader(sheet, rbtRow, ['total']);
    if (totalCol >= 0) {
      const val = extractCellValue(sheet, rbtRow, totalCol);
      if (val !== null && val !== undefined) result.receita_bruta_acumulada_12m = val;
    }
  }

  const rbaCorrenteRow = findRowByLabel(sheet, 'Receita bruta acumulada no ano-calendário corrente');
  if (rbaCorrenteRow >= 0) {
    const totalCol = findColumnByHeader(sheet, rbaCorrenteRow, ['total']);
    if (totalCol >= 0) {
      const val = extractCellValue(sheet, rbaCorrenteRow, totalCol);
      if (val !== null && val !== undefined) result.receita_bruta_ano_corrente = val;
    }
  }

  const rbaAnteriorRow = findRowByLabel(sheet, 'Receita bruta acumulada no ano-calendário anterior');
  if (rbaAnteriorRow >= 0) {
    const totalCol = findColumnByHeader(sheet, rbaAnteriorRow, ['total']);
    if (totalCol >= 0) {
      const val = extractCellValue(sheet, rbaAnteriorRow, totalCol);
      if (val !== null && val !== undefined) result.receita_bruta_ano_anterior = val;
    }
  }

  // Faixa de enquadramento
  const faixaRow = findRowByLabel(sheet, 'Faixa de Enquadramento');
  if (faixaRow >= 0) {
    for (let c = 1; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, faixaRow, c);
      if (val && String(val).match(/faixa/i)) {
        result.faixa_enquadramento = String(val);
        break;
      }
    }
  }

  // Fator R
  const fatorRow = findRowByLabel(sheet, 'Fator r');
  if (fatorRow >= 0) {
    for (let c = 1; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, fatorRow, c);
      if (typeof val === 'number') {
        result.fator_r = val;
        break;
      }
    }
  }

  // Seções - Anexo I Seção I (sem ST), Anexo I Seção II (com ST), Anexo III
  const secoes = scanSections(sheet, range);
  Object.assign(result, secoes);

  // Total Simples Nacional
  const simplesRow = findRowByLabel(sheet, 'Simples Nacional a recolher');
  if (simplesRow >= 0) {
    for (let c = range.e.c; c >= 1; c--) {
      const val = extractCellValue(sheet, simplesRow, c);
      if (typeof val === 'number' && val > 0) {
        result.simples_nacional_total = val;
        break;
      }
    }
  }

  // Alíquota efetiva
  if (result.simples_nacional_total && result.receita_bruta_periodo && result.receita_bruta_periodo > 0) {
    result.aliquota_efetiva = (result.simples_nacional_total / result.receita_bruta_periodo) * 100;
  }

  // Partilha
  const partilha = extractPartilha(sheet, range);
  Object.assign(result, partilha);

  // Histórico 12m da aba "Anexo"
  if (workbook.Sheets['Anexo']) {
    result.historico_12m = extractHistorico12m(workbook.Sheets['Anexo']);
  }

  // Converter periodo serial para MM/YYYY
  if (result._periodoRaw) {
    result.periodo = result._periodoRaw;
  } else if (result._periodo !== undefined && result._periodo !== null) {
    const d = excelSerialToDateSR(result._periodo);
    if (d) {
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      result.periodo = `${mes}/${ano}`;
    }
  }

  return result;
}

function excelSerialToDateSR(serial) {
  if (!serial && serial !== 0) return null;
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 86400000;
  let days = parseInt(serial);
  if (days > 60) days -= 2;
  return new Date(excelEpoch.getTime() + days * msPerDay);
}

function scanSections(sheet, range) {
  const result = {};

  // Scan for "Anexo" labels
  for (let r = 0; r <= range.e.r; r++) {
    const val = extractCellValue(sheet, r, 0);
    if (!val) continue;
    const nv = normalizeStr(String(val));

    if (nv.includes('anexo i') && nv.includes('seção i') && !nv.includes('seção ii')) {
      // Anexo I Seção I - sem ST
      result.total_saidas_sem_st = extractReceitaTributada(sheet, r, range);
    } else if (nv.includes('anexo i') && nv.includes('seção ii')) {
      // Anexo I Seção II - com ST
      result.total_saidas_st = extractReceitaTributada(sheet, r, range);
    } else if (nv.includes('anexo iii')) {
      result.total_servicos = extractReceitaTributada(sheet, r, range);
    }
  }

  return result;
}

function extractReceitaTributada(sheet, startRow, range) {
  for (let r = startRow; r <= Math.min(startRow + 30, range.e.r); r++) {
    const val = extractCellValue(sheet, r, 0);
    if (val && normalizeStr(String(val)).includes('receita tributada total')) {
      for (let c = range.e.c; c >= 1; c--) {
        const v = extractCellValue(sheet, r, c);
        if (typeof v === 'number') return v;
      }
    }
  }
  return null;
}

function extractPartilha(sheet, range) {
  const result = {
    valor_irpj: 0, valor_csll: 0, valor_cofins: 0,
    valor_pis: 0, valor_cpp: 0, valor_icms: 0, valor_iss: 0,
  };

  // Find "Partilha do Simples Nacional" or similar
  let partilhaStart = -1;
  for (let r = 0; r <= range.e.r; r++) {
    const val = extractCellValue(sheet, r, 0);
    if (val && normalizeStr(String(val)).includes('partilha')) {
      partilhaStart = r;
      break;
    }
  }

  if (partilhaStart < 0) return result;

  const colMap = {};
  for (let r = partilhaStart; r <= Math.min(partilhaStart + 5, range.e.r); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val) {
        const nv = normalizeStr(String(val));
        if (!colMap.irpj && (nv.includes('irpj') || nv === 'irpj')) colMap.irpj = c;
        if (!colMap.csll && (nv.includes('csll') || nv === 'csll')) colMap.csll = c;
        if (!colMap.cofins && (nv === 'cofins')) colMap.cofins = c;
        if (!colMap.pis && (nv === 'pis' || nv === 'pis/pasep')) colMap.pis = c;
        if (!colMap.cpp && (nv.includes('cpp') || nv.includes('inss') || nv.includes('previdenci'))) colMap.cpp = c;
        if (!colMap.icms && (nv === 'icms')) colMap.icms = c;
        if (!colMap.iss && (nv === 'iss' || nv === 'issqn')) colMap.iss = c;
      }
    }
  }

  // Sum "Valor:" rows after partilha start
  for (let r = partilhaStart + 2; r <= Math.min(range.e.r, partilhaStart + 50); r++) {
    const rowLabel = extractCellValue(sheet, r, 0);
    if (rowLabel && normalizeStr(String(rowLabel)).includes('total')) break;

    // Check if any cell in this row contains "Valor:"
    let isValueRow = false;
    for (let c = 0; c <= range.e.c; c++) {
      const v = extractCellValue(sheet, r, c);
      if (v && normalizeStr(String(v)) === 'valor:') {
        isValueRow = true;
        break;
      }
    }
    if (!isValueRow) continue;

    if (colMap.irpj >= 0) {
      const v = extractCellValue(sheet, r, colMap.irpj);
      if (typeof v === 'number') result.valor_irpj += v;
    }
    if (colMap.csll >= 0) {
      const v = extractCellValue(sheet, r, colMap.csll);
      if (typeof v === 'number') result.valor_csll += v;
    }
    if (colMap.cofins >= 0) {
      const v = extractCellValue(sheet, r, colMap.cofins);
      if (typeof v === 'number') result.valor_cofins += v;
    }
    if (colMap.pis >= 0) {
      const v = extractCellValue(sheet, r, colMap.pis);
      if (typeof v === 'number') result.valor_pis += v;
    }
    if (colMap.cpp >= 0) {
      const v = extractCellValue(sheet, r, colMap.cpp);
      if (typeof v === 'number') result.valor_cpp += v;
    }
    if (colMap.icms >= 0) {
      const v = extractCellValue(sheet, r, colMap.icms);
      if (typeof v === 'number') result.valor_icms += v;
    }
    if (colMap.iss >= 0) {
      const v = extractCellValue(sheet, r, colMap.iss);
      if (typeof v === 'number') result.valor_iss += v;
    }
  }

  return result;
}

function extractHistorico12m(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const historico = [];

  // Find table header with "Período" and "Receita Bruta"
  let headerRow = -1;
  let periodoCol = -1;
  let receitaCol = -1;

  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val && normalizeStr(String(val)).includes('periodo')) {
        headerRow = r;
        periodoCol = c;
      }
      if (val && normalizeStr(String(val)).includes('receita bruta') && !normalizeStr(String(val)).includes('exceto')) {
        if (headerRow === r) receitaCol = c;
      }
    }
    if (headerRow >= 0 && periodoCol >= 0 && receitaCol >= 0) break;
  }

  if (headerRow < 0 || receitaCol < 0) return historico;

  // Read rows
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const periodoVal = extractCellValue(sheet, r, periodoCol);
    const receitaVal = extractCellValue(sheet, r, receitaCol);

    if (!periodoVal || !receitaVal) continue;
    if (typeof receitaVal !== 'number') continue;

    let periodoStr = null;
    if (typeof periodoVal === 'number') {
      const d = excelSerialToDateSR(periodoVal);
      if (d) {
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const ano = d.getFullYear();
        periodoStr = `${mes}/${ano}`;
      }
    } else if (typeof periodoVal === 'string') {
      const match = periodoVal.match(/(\d{2})\/(\d{4})/);
      if (match) periodoStr = `${match[1]}/${match[2]}`;
    }

    if (periodoStr && !isNaN(receitaVal)) {
      historico.push({ periodo: periodoStr, receita_bruta: receitaVal });
    }
  }

  return historico;
}

// ---- Parsing Entradas ----

function parseEntradas(workbook) {
  const sheet = workbook.Sheets['Entradas'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Aba "Entradas" não encontrada no arquivo.');

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const result = {};

  // Find "Total Geral" row
  let totalGeralRow = -1;
  for (let r = 0; r <= range.e.r; r++) {
    const val = extractCellValue(sheet, r, 0);
    if (val && normalizeStr(String(val)) === 'total geral') {
      totalGeralRow = r;
      break;
    }
  }

  if (totalGeralRow < 0) return result;

  // Find column headers
  let headerRow = -1;
  for (let r = 3; r <= Math.min(8, range.e.r); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const val = extractCellValue(sheet, r, c);
      if (val && normalizeStr(String(val)).includes('valor contabil')) {
        headerRow = r;
        break;
      }
    }
    if (headerRow >= 0) break;
  }

  if (headerRow < 0) return result;

  const colValorContabil = findColumnByHeader(sheet, headerRow, ['valor contabil', 'valor contábil']);
  const colBaseCalculo = findColumnByHeader(sheet, headerRow, ['base calculo', 'base cálculo']);
  const colValor = findColumnByHeader(sheet, headerRow, ['valor']);

  // Total Geral - Valor Contábil
  if (colValorContabil >= 0) {
    const v = extractCellValue(sheet, totalGeralRow, colValorContabil);
    if (typeof v === 'number') result.total_entradas = v;
  }

  // For ICMS values, scan Total Geral row + nearby rows for ICMS type
  for (let r = totalGeralRow; r <= Math.min(totalGeralRow + 3, range.e.r); r++) {
    const label = extractCellValue(sheet, r, 0);
    const tipoVal = extractCellValue(sheet, r, headerRow > 0 ? 1 : 1);
    const isICMS = (label && normalizeStr(String(label)).includes('icms')) ||
      (tipoVal && normalizeStr(String(tipoVal)).includes('icms'));

    if (isICMS || r === totalGeralRow) {
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

  return result;
}

// ---- Component ----

export default function UploadSimples() {
  const queryClient = useQueryClient();
  const [empresaId, setEmpresaId] = useState('');
  const [simplesFile, setSimplesFile] = useState(null);
  const [entradasFile, setEntradasFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [cnpjWarning, setCnpjWarning] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [periodoMes, setPeriodoMes] = useState('');
  const [periodoAno, setPeriodoAno] = useState(String(new Date().getFullYear()));

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const empresa = empresas.find((e) => e.id === empresaId);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Apuracao.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apuracoes'] });
      setResult({ success: true, message: 'Relatórios processados com sucesso!' });
      setProcessing(false);
      setConfirmReplace(false);
      setPendingData(null);
    },
    onError: (err) => {
      setError('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
      setProcessing(false);
    },
  });

  const handleProcessar = async () => {
    setError(null);
    setCnpjWarning(null);
    setResult(null);
    setConfirmReplace(false);

    if (!empresaId) {
      setError('Selecione uma empresa.');
      return;
    }
    if (!simplesFile) {
      setError('O relatório Simples Nacional é obrigatório.');
      return;
    }
    if (empresa.tipo_empresa !== 'somente_servico' && !entradasFile) {
      setError('O relatório de Entradas por CFOP é obrigatório para este tipo de empresa.');
      return;
    }
    if (!periodoMes) {
      setError('Selecione o mês de referência.');
      return;
    }

    setProcessing(true);

    try {
      // Parse Simples Nacional
      const simplesData = await readXLSX(simplesFile);
      const simplesWorkbook = XLSX.read(simplesData, { type: 'array' });
      const parsedSimples = parseSimplesNacional(simplesWorkbook);

      // Parse Entradas (if needed)
      let parsedEntradas = {};
      if (empresa.tipo_empresa !== 'somente_servico' && entradasFile) {
        const entradasData = await readXLSX(entradasFile);
        const entradasWorkbook = XLSX.read(entradasData, { type: 'array' });
        parsedEntradas = parseEntradas(entradasWorkbook);
      }

      // Check CNPJ
      const cnpjEmpresa = empresa.cnpj ? empresa.cnpj.replace(/\D/g, '') : '';
      if (parsedSimples._cnpj && cnpjEmpresa && parsedSimples._cnpj !== cnpjEmpresa) {
        setCnpjWarning(
          `O CNPJ do relatório (${parsedSimples._cnpj}) não confere com o CNPJ da empresa (${cnpjEmpresa}).`
        );
      }

      // Build data payload
      const periodo = `${periodoMes}/${periodoAno}`;
      const payload = {
        empresa_id: empresaId,
        periodo,
        tipo_arquivo: 'dominio_simples',
        receita_bruta_periodo: parsedSimples.receita_bruta_periodo || 0,
        receita_bruta_acumulada_12m: parsedSimples.receita_bruta_acumulada_12m || 0,
        receita_bruta_ano_corrente: parsedSimples.receita_bruta_ano_corrente || 0,
        receita_bruta_ano_anterior: parsedSimples.receita_bruta_ano_anterior || 0,
        faixa_enquadramento: parsedSimples.faixa_enquadramento || null,
        fator_r: parsedSimples.fator_r || null,
        total_saidas_sem_st: parsedSimples.total_saidas_sem_st || 0,
        total_saidas_st: parsedSimples.total_saidas_st || 0,
        total_servicos: parsedSimples.total_servicos || 0,
        simples_nacional_total: parsedSimples.simples_nacional_total || 0,
        aliquota_efetiva: parsedSimples.aliquota_efetiva || 0,
        valor_irpj: parsedSimples.valor_irpj || 0,
        valor_csll: parsedSimples.valor_csll || 0,
        valor_cofins: parsedSimples.valor_cofins || 0,
        valor_pis: parsedSimples.valor_pis || 0,
        valor_cpp: parsedSimples.valor_cpp || 0,
        valor_icms: parsedSimples.valor_icms || 0,
        valor_iss: parsedSimples.valor_iss || 0,
        total_entradas: parsedEntradas.total_entradas || 0,
        base_calculo_icms_entradas: parsedEntradas.base_calculo_icms_entradas || 0,
        valor_icms_entradas: parsedEntradas.valor_icms_entradas || 0,
        historico_12m: parsedSimples.historico_12m || [],
      };

      // Check for duplicate
      const existentes = await base44.entities.Apuracao.filter({
        empresa_id: empresaId,
        periodo: periodo,
      });

      if (existentes.length > 0) {
        setPendingData({ ...payload, id: existentes[0].id });
        setConfirmReplace(true);
        setProcessing(false);
        return;
      }

      setPendingData(payload);
      createMutation.mutate(payload);
    } catch (err) {
      setError('Erro ao processar: ' + (err.message || 'Erro desconhecido'));
      setProcessing(false);
    }
  };

  const handleConfirmReplace = () => {
    if (!pendingData) return;
    setProcessing(true);
    setConfirmReplace(false);
    // Delete existing and create new
    base44.entities.Apuracao.delete(pendingData.id)
      .then(() => createMutation.mutate(pendingData))
      .catch((err) => {
        setError('Erro ao substituir: ' + (err.message || 'Erro desconhecido'));
        setProcessing(false);
      });
  };

  const handleCancelReplace = () => {
    setConfirmReplace(false);
    setPendingData(null);
  };

  const readXLSX = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(new Uint8Array(e.target.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileDrop = (setter) => (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) setter(file);
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Upload de Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">Simples Nacional — Processamento de arquivos do Domínio</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Selecionar Empresa e Arquivos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Empresa */}
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa..." />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {empresa && (
              <div className="flex items-center gap-2 mt-1.5 text-sm">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Tipo:{' '}
                  <span className="font-medium text-foreground">{tipoLabels[empresa.tipo_empresa]}</span>
                </span>
              </div>
            )}
          </div>

          {/* Mês de Referência */}
          <div className="space-y-2">
            <Label>
              Mês de Referência <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-3">
              <Select value={periodoMes} onValueChange={setPeriodoMes}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { value: '01', label: 'Janeiro' },
                    { value: '02', label: 'Fevereiro' },
                    { value: '03', label: 'Março' },
                    { value: '04', label: 'Abril' },
                    { value: '05', label: 'Maio' },
                    { value: '06', label: 'Junho' },
                    { value: '07', label: 'Julho' },
                    { value: '08', label: 'Agosto' },
                    { value: '09', label: 'Setembro' },
                    { value: '10', label: 'Outubro' },
                    { value: '11', label: 'Novembro' },
                    { value: '12', label: 'Dezembro' },
                  ].map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={periodoAno} onValueChange={setPeriodoAno}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => {
                    const ano = new Date().getFullYear() - 3 + i;
                    return (
                      <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Arquivo Simples Nacional */}
          <div className="space-y-2">
            <Label>
              Relatório Domínio — Simples Nacional{' '}
              <span className="text-destructive">*</span>
            </Label>
            <FileDropZone
              file={simplesFile}
              setFile={setSimplesFile}
              accept=".xlsx"
              label="Relatório Simples Nacional (.xlsx)"
            />
          </div>

          {/* Arquivo Entradas (condicional) */}
          {empresa && empresa.tipo_empresa !== 'somente_servico' && (
            <div className="space-y-2">
              <Label>
                Relatório Domínio — Entradas por CFOP{' '}
                <span className="text-destructive">*</span>
              </Label>
              <FileDropZone
                file={entradasFile}
                setFile={setEntradasFile}
                accept=".xlsx"
                label="Relatório de Entradas por CFOP (.xlsx)"
              />
            </div>
          )}

          {/* Actions */}
          {confirmReplace && (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Já existe uma apuração para o período {pendingData?.periodo}. Deseja substituir?
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleConfirmReplace}>Sim, substituir</Button>
                  <Button size="sm" variant="outline" onClick={handleCancelReplace}>Cancelar</Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {cnpjWarning && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{cnpjWarning}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result?.success && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleProcessar}
            disabled={processing || !empresaId}
            className="w-full gap-2 bg-primary hover:bg-primary/90"
            size="lg"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Processando...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-5 h-5" /> Processar Relatórios
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FileDropZone({ file, setFile, accept, label }) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  return (
    <label
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200',
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/50',
        file && 'border-green-300 bg-green-50'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) setFile(f);
      }}
    >
      {file ? (
        <>
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          <span className="text-sm font-medium text-green-700">{file.name}</span>
          <span className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(0)} KB — Clique para trocar
          </span>
        </>
      ) : (
        <>
          <Upload className="w-8 h-8 text-muted-foreground/50" />
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            Arraste o arquivo ou clique para selecionar
          </span>
        </>
      )}
      <input type="file" accept={accept} onChange={handleFile} className="hidden" />
    </label>
  );
}