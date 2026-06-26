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
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { parse as parseSomenteServico } from '@/lib/parsers/parserSomenteServico';
import { parse as parseEntradasSaidas } from '@/lib/parsers/parserEntradasSaidas';
import { parse as parseEntradasSaidasServicos } from '@/lib/parsers/parserEntradasSaidasServicos';
import { parsePGDAS, classifyFaixa } from '@/lib/parsers/parserPGDAS';
import { parseEntradas } from '@/lib/parsers/utils';

const tipoLabels = {
  somente_servico: 'Somente Prestação de Serviços',
  entradas_saidas: 'Entradas e Saídas (Comércio)',
  entradas_saidas_servicos: 'Entradas, Saídas e Serviços (Comércio + Serviços)',
};

export default function UploadSimples() {
  const queryClient = useQueryClient();
  const [empresaId, setEmpresaId] = useState('');
  const [simplesFile, setSimplesFile] = useState(null);
  const [entradasFiles, setEntradasFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [cnpjWarning, setCnpjWarning] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date', 100),
  });

  const empresa = empresas.find((e) => e.id === empresaId);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Apuracao.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apuracoes'] });
      setResult({ success: true, message: 'Relatório processado com sucesso!' });
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

    if (!empresaId) { setError('Selecione uma empresa.'); return; }
    if (!simplesFile) { setError('O arquivo do Simples Nacional é obrigatório.'); return; }

    setProcessing(true);

    try {
      const isPDF = simplesFile.name.toLowerCase().endsWith('.pdf');
      const isXLSX = simplesFile.name.toLowerCase().endsWith('.xlsx');

      let parsed;

      // Processar e somar múltiplos arquivos de entradas (filiais)
      const entradasMerge = { total_entradas: 0, base_calculo_icms_entradas: 0, valor_icms_entradas: 0 };
      if (entradasFiles.length > 0) {
        for (const file of entradasFiles) {
          const data = await readFileAsArray(file);
          const wb = XLSX.read(data, { type: 'array' });
          const e = parseEntradas(wb);
          entradasMerge.total_entradas += e.total_entradas || 0;
          entradasMerge.base_calculo_icms_entradas += e.base_calculo_icms_entradas || 0;
          entradasMerge.valor_icms_entradas += e.valor_icms_entradas || 0;
        }
        entradasMerge.total_entradas = Math.round(entradasMerge.total_entradas * 100) / 100;
        entradasMerge.base_calculo_icms_entradas = Math.round(entradasMerge.base_calculo_icms_entradas * 100) / 100;
        entradasMerge.valor_icms_entradas = Math.round(entradasMerge.valor_icms_entradas * 100) / 100;
      }

      if (isXLSX) {
        // ---- Fluxo Excel (original) ----
        const simplesData = await readFileAsArray(simplesFile);
        const simplesWorkbook = XLSX.read(simplesData, { type: 'array' });

        if (empresa.tipo_empresa === 'somente_servico') {
          parsed = parseSomenteServico(simplesWorkbook);
        } else if (empresa.tipo_empresa === 'entradas_saidas') {
          parsed = parseEntradasSaidas(simplesWorkbook, null);
        } else {
          parsed = parseEntradasSaidasServicos(simplesWorkbook, null);
        }

        // Mesclar entradas somadas (matriz + filiais)
        if (entradasFiles.length > 0) {
          parsed.total_entradas = entradasMerge.total_entradas;
          parsed.base_calculo_icms_entradas = entradasMerge.base_calculo_icms_entradas;
          parsed.valor_icms_entradas = entradasMerge.valor_icms_entradas;
        }

        // O parser Excel já calculou aliquota_efetiva e faixa_enquadramento
        // Faixa também pode ser classificada via RBT12 como fallback
        if (!parsed.faixa_enquadramento) {
          parsed.faixa_enquadramento = classifyFaixa(parsed.receita_bruta_acumulada_12m);
        }
      } else if (isPDF) {
        // ---- Fluxo PDF PGDAS-D ----
        parsed = await parsePGDAS(simplesFile);

        // Mesclar entradas somadas (matriz + filiais)
        if (entradasFiles.length > 0) {
          parsed.total_entradas = entradasMerge.total_entradas;
          parsed.base_calculo_icms_entradas = entradasMerge.base_calculo_icms_entradas;
          parsed.valor_icms_entradas = entradasMerge.valor_icms_entradas;
        }

        // Calcular aliquota_efetiva para PDF
        if (parsed.receita_bruta_periodo > 0 && parsed.simples_nacional_total > 0) {
          parsed.aliquota_efetiva = (parsed.simples_nacional_total / parsed.receita_bruta_periodo) * 100;
        }
      } else {
        throw new Error('Formato de arquivo não suportado. Use .xlsx ou .pdf.');
      }

      if (!parsed.periodo) {
        throw new Error('Não foi possível identificar o período no documento.');
      }

      // Validar CNPJ
      const cnpjEmpresa = empresa.cnpj ? empresa.cnpj.replace(/\D/g, '') : '';
      if (parsed._cnpj && cnpjEmpresa && parsed._cnpj !== cnpjEmpresa) {
        setCnpjWarning(
          `O CNPJ do relatório (${parsed._cnpj}) não confere com o CNPJ da empresa (${cnpjEmpresa}).`
        );
      }

      const receita = parsed.receita_bruta_periodo || 0;
      const simples = parsed.simples_nacional_total || 0;

      const payload = {
        empresa_id: empresaId,
        periodo: parsed.periodo,
        tipo_arquivo: 'dominio_simples',
        receita_bruta_periodo: receita,
        receita_bruta_acumulada_12m: parsed.receita_bruta_acumulada_12m || 0,
        receita_bruta_ano_corrente: parsed.receita_bruta_ano_corrente || 0,
        receita_bruta_ano_anterior: parsed.receita_bruta_ano_anterior || 0,
        faixa_enquadramento: parsed.faixa_enquadramento || null,
        fator_r: parsed.fator_r || null,
        total_saidas_sem_st: parsed.total_saidas_sem_st || 0,
        total_saidas_st: parsed.total_saidas_st || 0,
        total_servicos: parsed.total_servicos || 0,
        simples_nacional_total: simples,
        aliquota_efetiva: parsed.aliquota_efetiva || (receita > 0 ? (simples / receita) * 100 : 0),
        valor_irpj: parsed.valor_irpj || 0,
        valor_csll: parsed.valor_csll || 0,
        valor_cofins: parsed.valor_cofins || 0,
        valor_pis: parsed.valor_pis || 0,
        valor_cpp: parsed.valor_cpp || 0,
        valor_icms: parsed.valor_icms || 0,
        valor_iss: parsed.valor_iss || 0,
        total_entradas: parsed.total_entradas || 0,
        base_calculo_icms_entradas: parsed.base_calculo_icms_entradas || 0,
        valor_icms_entradas: parsed.valor_icms_entradas || 0,
        historico_12m: parsed.historico_12m || [],
      };

      // Verificar duplicata
      const existentes = await base44.entities.Apuracao.filter({
        empresa_id: empresaId,
        periodo: parsed.periodo,
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

  const readFileAsArray = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(new Uint8Array(e.target.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

  const isEntradasRelevante = empresa && empresa.tipo_empresa !== 'somente_servico';

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Upload de Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">Simples Nacional — Processamento de arquivos do Domínio e PGDAS-D</p>
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
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
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

          {/* Arquivo Simples Nacional (XLSX ou PDF) */}
          <div className="space-y-2">
            <Label>
              Relatório Simples Nacional <span className="text-destructive">*</span>
            </Label>
            <FileDropZone
              file={simplesFile}
              setFile={setSimplesFile}
              accept=".xlsx,.pdf"
              label="Relatório Simples Nacional (.xlsx ou .pdf)"
            />
            <p className="text-xs text-muted-foreground">
              Aceita relatórios Excel do Domínio (.xlsx) ou declaração PGDAS-D (.pdf)
            </p>
          </div>

          {/* Arquivo Entradas (múltiplos — matriz + filiais) */}
          {isEntradasRelevante && (
            <div className="space-y-2">
              <Label>
                Relatório Domínio — Entradas por CFOP{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  (necessário para dados de compras — adicione um arquivo por estabelecimento)
                </span>
              </Label>
              <MultiFileDropZone
                files={entradasFiles}
                setFiles={setEntradasFiles}
                accept=".xlsx"
                label="Relatório de Entradas por CFOP (.xlsx)"
              />
              {entradasFiles.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {entradasFiles.length} arquivos selecionados — os valores serão somados (matriz + filiais)
                </p>
              )}
            </div>
          )}

          {/* Alertas */}
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
              <><Loader2 className="w-5 h-5 animate-spin" /> Processando...</>
            ) : (
              <><FileText className="w-5 h-5" /> Processar Relatório</>
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
          <span className="text-sm font-medium text-green-700">{file.name}</span>
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

function MultiFileDropZone({ files, setFiles, accept, label }) {
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (newFiles) => {
    const arr = Array.from(newFiles);
    // Evitar duplicatas por nome + tamanho
    const existing = new Set(files.map((f) => `${f.name}_${f.size}`));
    const unique = arr.filter((f) => !existing.has(`${f.name}_${f.size}`));
    if (unique.length > 0) setFiles([...files, ...unique]);
  };

  const removeFile = (idx) => {
    setFiles(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <label
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/50',
          files.length > 0 && 'border-green-300 bg-green-50'
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="w-8 h-8 text-muted-foreground/50" />
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          Arraste os arquivos ou clique para selecionar (um por estabelecimento)
        </span>
        <input
          type="file"
          accept={accept}
          multiple
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
          className="hidden"
        />
      </label>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, idx) => (
            <div
              key={`${file.name}_${file.size}`}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-green-50 border border-green-200"
            >
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-green-700 truncate block">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="p-1 rounded-full hover:bg-white text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                aria-label="Remover arquivo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}