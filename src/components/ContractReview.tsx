import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Download, FolderOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { gerarPacoteDocumentos } from "@/lib/document-generation.functions";
import { formatCurrency } from "@/lib/format";
import { officeDatabase } from "@/lib/office-database";
import { analisarObjetoProcuracao } from "@/lib/procuracao-analysis.functions";

type ContractReviewProps = {
  contractId: string;
  personType: "PF" | "PJ";
  onBack?: (() => void) | undefined;
  onEditObject?: (() => void) | undefined;
  onFinish: () => void;
};

type Analysis = {
  situacao: "ok" | "alerta" | "bloqueado" | "erro";
  poderes_especificos: string;
  destino: string;
  parte_contraria: string;
  alertas: string[];
  motivo_bloqueio: string;
};

type Generated = { kind: string; file_name: string; file_path: string };
type DriveResult = { ok: true; pasta_url: string } | { ok: false; erro: string } | null;

const MODALIDADES: Record<string, string> = {
    parcelado: "Pró-labore Parcelado",
    mensal: "Pró-labore Mensal",
  exito: "Somente êxito",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? fallback;
}

export function ContractReview({ contractId, personType, onBack, onEditObject, onFinish }: ContractReviewProps) {
  const analyze = useServerFn(analisarObjetoProcuracao);
  const generate = useServerFn(gerarPacoteDocumentos);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [poderes, setPoderes] = useState("");
  const [destino, setDestino] = useState("");
  const [generating, setGenerating] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [generated, setGenerated] = useState<Generated[] | null>(null);
  const [drive, setDrive] = useState<DriveResult>(null);

  const { data: contract } = useQuery({
    queryKey: ["contract-review", contractId],
    queryFn: async () => {
      const { data, error } = await officeDatabase(supabase)
        .from("contracts")
        .select("numero, ano, modality, total_value, installments_count, success_fee_percent, objeto, gratuidade, clients(name)")
        .eq("id", contractId)
        .single();
      if (error) throw error;
      return data as unknown as {
        numero: number;
        ano: number;
        modality: string;
        total_value: number;
        installments_count: number;
        success_fee_percent: number;
        objeto: string | null;
        gratuidade: boolean | null;
        clients: { name: string } | null;
      };
    },
  });

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const result = (await analyze({ data: { contrato_id: contractId } })) as Analysis;
      setAnalysis(result);
      setPoderes(result.poderes_especificos);
      setDestino(result.destino);
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível analisar o objeto."));
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    void runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  async function approve() {
    if (!analysis) return;
    setGenerating(true);
    setMissing([]);
    try {
      const result = await generate({
        data: {
          contrato_id: contractId,
          poderes_especificos: poderes.trim(),
          destino: destino.trim(),
          parte_contraria: analysis.parte_contraria ?? "",
          situacao_analise: analysis.situacao === "alerta" ? "alerta" : "ok",
          editado: poderes.trim() !== analysis.poderes_especificos.trim() || destino.trim() !== analysis.destino.trim(),
        },
      });
      if (result.faltantes.length > 0) {
        setMissing(result.faltantes);
        return;
      }
      setGenerated(result.gerados);
      setDrive(result.drive as DriveResult);
      toast.success("Documentos gerados.");
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível gerar os documentos."));
    } finally {
      setGenerating(false);
    }
  }

  async function download(file: Generated) {
    const { data, error } = await supabase.storage
      .from("client-documents")
      .createSignedUrl(file.file_path, 60, { download: file.file_name });
    if (error || !data) {
      toast.error("Não foi possível baixar o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  const gratuidade = personType === "PF" && contract?.gratuidade === true;
  const documentos = ["Procuração", ...(gratuidade ? ["Declaração de Hipossuficiência"] : []), "Contrato"];
  const remuneracao = contract
    ? contract.modality === "exito"
      ? `${MODALIDADES["exito"]} – ${String(contract.success_fee_percent).replace(".", ",")}%`
      : `${MODALIDADES[contract.modality] ?? contract.modality} – ${formatCurrency(contract.total_value)} em ${contract.installments_count}x${Number(contract.success_fee_percent) > 0 ? ` + ${String(contract.success_fee_percent).replace(".", ",")}% de êxito` : ""}`
    : "";

  if (generated) {
    return (
      <div className="space-y-5">
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Documentos gerados</AlertTitle>
          <AlertDescription>Os arquivos foram salvos na ficha do cliente.</AlertDescription>
        </Alert>
        <ul className="space-y-2">
          {generated.map((file) => (
            <li key={file.file_path} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span className="break-all">{file.file_name}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void download(file)}>
                <Download className="size-4" />
                Baixar
              </Button>
            </li>
          ))}
        </ul>
        {drive?.ok ? (
          <Button asChild variant="outline">
            <a href={drive.pasta_url} target="_blank" rel="noreferrer">
              <FolderOpen className="size-4" />
                            Abrir Pasta no Drive

            </a>
          </Button>
        ) : drive && !drive.ok ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Não foi possível enviar ao Drive</AlertTitle>
            <AlertDescription>{drive.erro} Os documentos continuam salvos no sistema.</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" onClick={onFinish}>Ir para a ficha</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 text-sm">
        <h3 className="text-base font-semibold text-[#0F2340]">Resumo</h3>
        <p><span className="text-muted-foreground">Cliente:</span> {contract?.clients?.name ?? "…"}</p>
        <p><span className="text-muted-foreground">Contrato:</span> {contract ? `${String(contract.numero).padStart(3, "0")}/${contract.ano}` : "…"}</p>
        <p><span className="text-muted-foreground">Remuneração:</span> {remuneracao}</p>
        <p style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          <span className="font-sans text-muted-foreground">Objeto:</span> O objeto do presente contrato é a prestação de serviços advocatícios relativos {contract?.objeto ?? "…"}.
        </p>
        {personType === "PF" ? <p><span className="text-muted-foreground">Gratuidade de justiça:</span> {gratuidade ? "Sim" : "Não"}</p> : null}
        <p><span className="text-muted-foreground">Documentos que serão gerados:</span> {documentos.join(", ")}</p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[#0F2340]">Procuração</h3>
          {!analyzing ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void runAnalysis()}>
              <RefreshCw className="size-4" />
              Analisar novamente
            </Button>
          ) : null}
        </div>

        {analyzing ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Analisando o objeto do contrato…
          </p>
        ) : analysis?.situacao === "bloqueado" ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Objeto insuficiente para a procuração</AlertTitle>
            <AlertDescription>
              {analysis.motivo_bloqueio}
              {onEditObject ? (
                <div className="mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={onEditObject}>Corrigir objeto</Button>
                </div>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : analysis ? (
          <>
            {analysis.situacao === "erro" ? (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertTitle>Análise automática indisponível</AlertTitle>
                <AlertDescription>
                  {analysis.motivo_bloqueio} Você pode preencher os campos abaixo manualmente e aprovar.
                </AlertDescription>
              </Alert>
            ) : null}
            {analysis.alertas.length > 0 ? (
              <div className="rounded-md border border-[#E8B9A5] bg-[#FFF4EF] px-4 py-3 text-sm text-[#7A3F2D]">
                <p className="font-medium">Confira antes de aprovar:</p>
                <ul className="mt-1 list-disc pl-5">
                  {analysis.alertas.map((alerta) => <li key={alerta}>{alerta}</li>)}
                </ul>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="review-poderes">Poderes específicos</Label>
              <Textarea id="review-poderes" rows={3} value={poderes} onChange={(event) => setPoderes(event.target.value)} />
              <p className="text-xs text-muted-foreground">Comece com ", especialmente para". Poderes especiais (receber citação, levantar valores, renunciar, confessar) não são aceitos.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-destino">Perante (tribunal)</Label>
              <Textarea id="review-destino" rows={2} value={destino} onChange={(event) => setDestino(event.target.value)} />
            </div>
            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              …desistir{poderes} e tudo mais que se fizer necessário para representar os interesses do outorgante perante {destino || "…"}, mas em hipótese alguma receber citação.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">A análise não foi concluída. Clique em "Analisar novamente".</p>
        )}
      </section>

      {missing.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Faltam dados para gerar os documentos</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-5">
              {missing.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        {onBack ? <Button type="button" variant="outline" onClick={onBack}>Voltar</Button> : <span />}
        <Button
          type="button"
          onClick={() => void approve()}
          disabled={analyzing || generating || !analysis || analysis.situacao === "bloqueado" || !destino.trim()}
        >
          {generating ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Gerando…
            </>
          ) : "Aprovar e gerar documentos"}
        </Button>
      </div>
    </div>
  );
}


