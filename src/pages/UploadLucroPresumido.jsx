import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseSpedICMS } from '@/lib/parsers/parserSpedICMS';
import { parseSpedPISCOFINS } from '@/lib/parsers/parserSpedPISCOFINS';

export default function UploadLucroPresumido() {
  const queryClient = useQueryClient();
  const [empresaId, setEmpresaId] = useState('');
  const [icmsFile, setIcmsFile] = useState(null);
  const [pisFile, setPisFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const empresasFiltradas = empresas.filter((e) => e.regime_tributario === 'lucro_presumido');

  const empresa = empresas.find(e => e.id === empresaId);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ApuracaoLucroPresumido.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apuracoes-lp'] });
      setResult({ success: true, message: 'SPEDs processados com sucesso!' });
      setProcessing(false);
      setConfirmReplace(false);
      setPendingData(null);
    },
    onError: (err) => {
      setError('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
      setProcessing(false);
    },
  });

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, 'latin1');
    });

  const handleProcessar = async () => {
    setError(null);
    setResult(null);
    setConfirmReplace(false);

    if (!empresaId) { setError('Selecione uma empresa.'); return; }
    if (!icmsFile && !pisFile) { setError('Anexe ao menos um arquivo SPED.'); return; }

    setProcessing(true);

    try {
      let icmsData = {};
      let pisData = {};

      if (icmsFile) {
        const text = await readFileAsText(icmsFile);
        icmsData = parseSpedICMS(text);
      }

      if (pisFile) {
        const text = await readFileAsText(pisFile);
        pisData = parseSpedPISCOFINS(text);
      }

      // Período: preferir do ICMS, fallback PIS
      const periodo = icmsData.periodo || pisData.periodo;
      if (!periodo) throw new Error('Não foi possível identificar o período nos arquivos.');

      // Gerar alertas via IA
      let alertas = [];
      try {
        const alertasResp = await base44.integrations.Core.InvokeLLM({
          prompt: `Você é um especialista tributário brasileiro. Analise os dados extraídos dos SPEDs de uma empresa do Lucro Presumido referente ao período ${periodo} e aponte possíveis erros, inconsistências e alertas tributários.

CONTEXSO TRIBUTÁRIO IMPORTANTE:
1. ICMS: O saldo apurado NÃO é simplesmente (Débito - Crédito). O cálculo correto é: (Débitos + Ajustes a Débito) - (Créditos + Ajustes a Crédito + Saldo Credor do Período Anterior). Portanto, quando há saldo credor do período anterior, o saldo final pode ser credor (negativo) mesmo com débitos maiores que créditos no período. NÃO flague como erro matemático a diferença entre Débito e Crédito sem considerar o saldo credor anterior.
2. PIS e COFINS: No Lucro Presumido, o regime é CUMULATIVO — NÃO gera créditos sobre compras e despesas. O imposto é calculado diretamente sobre o faturamento (PIS 0,65% e COFINS 3,00%). Portanto, a existência apenas de débito (sem crédito) é o comportamento ESPERADO e correto. NÃO flague a ausência de créditos de PIS/COFINS como erro ou inconsistência.
3. Receita de Serviços Prestados: valores extraídos do registro F550 do SPED PIS/COFINS sem CFOP vinculado. Essa receita também é faturamento da empresa (compõe a base de cálculo de PIS/COFINS) e deve ser somada à receita de vendas ao analisar carga tributária, relação compras/faturamento e demais indicadores — não trate a ausência de CFOP nela como erro.

Dados:
- Total de Compras: R$ ${(icmsData.total_compras || 0).toFixed(2)}
- Total de Vendas (mercadorias): R$ ${(icmsData.total_vendas || 0).toFixed(2)}
- Total de Serviços Prestados: R$ ${(pisData.total_servicos_prestados || 0).toFixed(2)}
- ICMS Débito: R$ ${(icmsData.icms_debito || 0).toFixed(2)}
- ICMS Crédito: R$ ${(icmsData.icms_credito || 0).toFixed(2)}
- ICMS Saldo (já considera saldo credor anterior): R$ ${(icmsData.icms_saldo || 0).toFixed(2)}
- PIS Débito (regime cumulativo): R$ ${(pisData.pis_debito || 0).toFixed(2)}
- COFINS Débito (regime cumulativo): R$ ${(pisData.cofins_debito || 0).toFixed(2)}
- CFOPs de vendas: ${(icmsData.vendas_por_cfop || []).map(c => c.cfop).join(', ')}
- CFOPs de compras: ${(icmsData.compras_por_cfop || []).map(c => c.cfop).join(', ')}

Retorne até 8 alertas objetivos e práticos, classificados como "erro" (inconsistência grave), "aviso" (atenção necessária) ou "info" (informação relevante). Seja específico com os valores quando relevante. Foque em inconsistências reais, CFOPs atípicos, relação compras/vendas, e pontos de atenção fiscal — não em validações matemáticas de saldo que já consideram o contexto do período anterior.`,
          response_json_schema: {
            type: 'object',
            properties: {
              alertas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tipo: { type: 'string', enum: ['erro', 'aviso', 'info'] },
                    descricao: { type: 'string' }
                  }
                }
              }
            }
          }
        });
        alertas = alertasResp.alertas || [];
      } catch (_) {
        // alertas opcionais — não bloqueia
      }

      const payload = {
        empresa_id: empresaId,
        periodo,
        cnpj: icmsData.cnpj || pisData.cnpj || empresa?.cnpj?.replace(/\D/g, '') || null,
        nome_empresa: icmsData.nome_empresa || pisData.nome_empresa || empresa?.nome || null,

        total_compras: Math.round((icmsData.total_compras || 0) * 100) / 100,
        qtd_notas_compras: icmsData.qtd_notas_compras || 0,
        total_vendas: Math.round((icmsData.total_vendas || 0) * 100) / 100,
        qtd_notas_vendas: icmsData.qtd_notas_vendas || 0,
        total_servicos_prestados: Math.round((pisData.total_servicos_prestados || 0) * 100) / 100,

        icms_base_calculo: Math.round((icmsData.icms_base_calculo || 0) * 100) / 100,
        icms_debito: Math.round((icmsData.icms_debito || 0) * 100) / 100,
        icms_credito: Math.round((icmsData.icms_credito || 0) * 100) / 100,
        icms_ajustes_debito: Math.round((icmsData.icms_ajustes_debito || 0) * 100) / 100,
        icms_ajustes_credito: Math.round((icmsData.icms_ajustes_credito || 0) * 100) / 100,
        icms_saldo: Math.round((icmsData.icms_saldo || 0) * 100) / 100,

        pis_receita_bruta: Math.round((pisData.pis_receita_bruta || 0) * 100) / 100,
        pis_base_credito: Math.round((pisData.pis_base_credito || 0) * 100) / 100,
        pis_base_debito: Math.round((pisData.pis_base_debito || 0) * 100) / 100,
        pis_credito: Math.round((pisData.pis_credito || 0) * 100) / 100,
        pis_debito: Math.round((pisData.pis_debito || 0) * 100) / 100,
        pis_saldo: Math.round((pisData.pis_saldo || 0) * 100) / 100,

        cofins_receita_bruta: Math.round((pisData.cofins_receita_bruta || 0) * 100) / 100,
        cofins_base_credito: Math.round((pisData.cofins_base_credito || 0) * 100) / 100,
        cofins_base_debito: Math.round((pisData.cofins_base_debito || 0) * 100) / 100,
        cofins_credito: Math.round((pisData.cofins_credito || 0) * 100) / 100,
        cofins_debito: Math.round((pisData.cofins_debito || 0) * 100) / 100,
        cofins_saldo: Math.round((pisData.cofins_saldo || 0) * 100) / 100,

        vendas_por_cfop: icmsData.vendas_por_cfop || [],
        compras_por_cfop: icmsData.compras_por_cfop || [],
        top_clientes: icmsData.top_clientes || [],
        top_fornecedores: icmsData.top_fornecedores || [],
        icms_creditos_por_origem: icmsData.icms_creditos_por_origem || [],
        cst_icms_dist: icmsData.cst_icms_dist || [],
        cst_pis_dist: pisData.cst_pis_dist || [],
        cst_cofins_dist: pisData.cst_cofins_dist || [],
        vendas_por_uf: icmsData.vendas_por_uf || [],
        ncm_ranking: [],
        alertas,
      };

      // Verificar duplicata
      const existentes = await base44.entities.ApuracaoLucroPresumido.filter({
        empresa_id: empresaId,
        periodo,
      });

      if (existentes.length > 0) {
        setPendingData({ ...payload, _existenteId: existentes[0].id });
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
    const { _existenteId, ...data } = pendingData;
    base44.entities.ApuracaoLucroPresumido.delete(_existenteId)
      .then(() => createMutation.mutate(data))
      .catch(err => {
        setError('Erro ao substituir: ' + (err.message || 'Erro desconhecido'));
        setProcessing(false);
      });
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Upload de SPEDs — Lucro Presumido</h1>
        <p className="text-muted-foreground text-sm mt-1">Processamento do SPED EFD ICMS/IPI e EFD Contribuições PIS/COFINS</p>
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
                {empresasFiltradas.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SPED ICMS */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              SPED EFD ICMS/IPI
              <span className="text-xs font-normal text-muted-foreground">(.txt)</span>
            </Label>
            <FileDropZone
              file={icmsFile}
              setFile={setIcmsFile}
              accept=".txt"
              label="SPED EFD ICMS/IPI (.txt)"
            />
            <p className="text-xs text-muted-foreground">
              Arquivo gerado pelo sistema contábil para EFD ICMS — contém compras, vendas, apuração ICMS
            </p>
          </div>

          {/* SPED PIS/COFINS */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              SPED EFD Contribuições PIS/COFINS
              <span className="text-xs font-normal text-muted-foreground">(.txt)</span>
            </Label>
            <FileDropZone
              file={pisFile}
              setFile={setPisFile}
              accept=".txt"
              label="SPED EFD Contribuições PIS/COFINS (.txt)"
            />
            <p className="text-xs text-muted-foreground">
              Arquivo EFD Contribuições — contém apuração de PIS e COFINS
            </p>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex gap-2 text-sm text-blue-800">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Você pode enviar apenas um dos arquivos. Os dados disponíveis serão processados e uma análise com alertas tributários será gerada automaticamente.</span>
          </div>

          {/* Alertas de confirmação */}
          {confirmReplace && (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Já existe uma apuração para o período {pendingData?.periodo}. Deseja substituir?
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleConfirmReplace}>Sim, substituir</Button>
                  <Button size="sm" variant="outline" onClick={() => { setConfirmReplace(false); setPendingData(null); }}>Cancelar</Button>
                </div>
              </AlertDescription>
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
            disabled={processing || !empresaId || (!icmsFile && !pisFile)}
            className="w-full gap-2 bg-primary hover:bg-primary/90"
            size="lg"
          >
            {processing ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Processando (pode levar alguns segundos)...</>
            ) : (
              <><FileText className="w-5 h-5" /> Processar SPEDs</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FileDropZone({ file, setFile, accept, label }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <label
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200',
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
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFile(null); }}
            className="absolute top-2 right-2 p-1 rounded-full bg-white/80 hover:bg-white text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remover arquivo"
          >
            <X className="w-4 h-4" />
          </button>
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          <span className="text-sm font-medium text-green-700 text-center break-all px-2 max-w-full">{file.name}</span>
          <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB — Clique para trocar</span>
        </>
      ) : (
        <>
          <Upload className="w-8 h-8 text-muted-foreground/50" />
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">Arraste o arquivo ou clique para selecionar</span>
        </>
      )}
      <input type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} className="hidden" />
    </label>
  );
}