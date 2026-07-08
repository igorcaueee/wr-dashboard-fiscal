import { base44 } from '@/api/base44Client';

// Classificação de faixa conforme RBT12 (Tabela Simples Nacional)
export function classifyFaixa(rbt12) {
  if (!rbt12 || rbt12 <= 0) return null;
  if (rbt12 <= 180000) return '1ª Faixa';
  if (rbt12 <= 360000) return '2ª Faixa';
  if (rbt12 <= 720000) return '3ª Faixa';
  if (rbt12 <= 1800000) return '4ª Faixa';
  if (rbt12 <= 3600000) return '5ª Faixa';
  return '6ª Faixa';
}

export async function parsePGDAS(file) {
  // Upload do PDF
  const { file_url } = await base44.integrations.Core.UploadFile({ file });

  // Extração via AI
  const extracted = await base44.integrations.Core.InvokeLLM({
    prompt: `Analise este documento PGDAS-D (Declaração do Simples Nacional) e extraia os dados seguindo rigorosamente estas regras:

1. Converta TODOS os valores monetários brasileiros para float (ex: "96.002,46" → 96002.46)
2. _cnpj: somente dígitos do CNPJ Matriz (ex: "51.061.501/0001-19" → "51061501000119")
3. periodo: formato "MM/YYYY" baseado no "Período de Apuração" (ex: "01/05/2026 a 31/05/2026" → "05/2026")
4. receita_bruta_periodo: "Receita Bruta do PA (RPA) - Caixa" — coluna Total
5. receita_bruta_acumulada_12m: "RBT12" — coluna Total
6. receita_bruta_ano_corrente: "RBA" (ano-calendário corrente) — coluna Total
7. receita_bruta_ano_anterior: "RBAA" (ano-calendário anterior) — coluna Total
8. fator_r: valor numérico do Fator r; retorne 0 se "Não se aplica"
9. simples_nacional_total: "Valor Total do Débito Declarado" da seção 2.6 Resumo
10. Para os tributos use a seção "Totais do Estabelecimento" (ou "2.8 Total Geral"):
    - valor_irpj: coluna IRPJ
    - valor_csll: coluna CSLL
    - valor_cofins: coluna COFINS
    - valor_pis: coluna PIS/Pasep
    - valor_cpp: coluna INSS/CPP
    - valor_icms: coluna ICMS
    - valor_iss: coluna ISS
11. Para receitas por atividade (seção 2.7 "Valor do Débito por Tributo"):
    - total_saidas_sem_st: "Receita Bruta Informada" da atividade de Revenda SEM substituição tributária
    - total_saidas_st: "Receita Bruta Informada" da atividade de Revenda COM substituição tributária
    - total_servicos: "Receita Bruta Informada" da atividade de Prestação de Serviços
    - Se a atividade não existir, retorne 0
12. historico_12m: seção 2.2.1 Mercado Interno — todos os pares período/valor listados, formato "MM/YYYY"`,
    file_urls: [file_url],
    response_json_schema: {
      type: 'object',
      properties: {
        _cnpj: { type: 'string' },
        periodo: { type: 'string' },
        receita_bruta_periodo: { type: 'number' },
        receita_bruta_acumulada_12m: { type: 'number' },
        receita_bruta_ano_corrente: { type: 'number' },
        receita_bruta_ano_anterior: { type: 'number' },
        fator_r: { type: 'number' },
        simples_nacional_total: { type: 'number' },
        valor_irpj: { type: 'number' },
        valor_csll: { type: 'number' },
        valor_cofins: { type: 'number' },
        valor_pis: { type: 'number' },
        valor_cpp: { type: 'number' },
        valor_icms: { type: 'number' },
        valor_iss: { type: 'number' },
        total_saidas_sem_st: { type: 'number' },
        total_saidas_st: { type: 'number' },
        total_servicos: { type: 'number' },
        historico_12m: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              periodo: { type: 'string' },
              receita_bruta: { type: 'number' }
            }
          }
        }
      }
    }
  });

  // Classificar faixa com base no RBT12
  extracted.faixa_enquadramento = classifyFaixa(extracted.receita_bruta_acumulada_12m);

  return extracted;
}

// Preview leve do período de apuração (PDF) — apenas upload + prompt mínimo
export async function extractPeriodPreview(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });

  const extracted = await base44.integrations.Core.InvokeLLM({
    prompt: `Extraia apenas o período de apuração deste documento PGDAS-D. Retorne no formato MM/YYYY (ex: "05/2026"). Baseie-se no campo "Período de Apuração" (ex: "01/05/2026 a 31/05/2026" → "05/2026").`,
    file_urls: [file_url],
    response_json_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string' }
      }
    }
  });

  return extracted.periodo || null;
}