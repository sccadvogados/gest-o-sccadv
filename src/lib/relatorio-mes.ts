/**
 * Relatório do Mês (PDF) do Livro-Caixa, para prestação de contas entre os sócios.
 * Visual no padrão dos memoriais do escritório (logo, quadro de dados, títulos numerados em azul e cobre).
 * Gerado no navegador com jsPDF + jspdf-autotable (carregados só ao clicar no botão).
 */
import { LOGO_SCC } from "@/lib/logo-scc";

export type LancamentoRelatorio = {
  data: string;
  descricao: string;
  tipo: string;
  categoria: string;
  valor: number;
  socio: string | null;
  origem: string;
  revisar: boolean;
  distribuido?: boolean;
  clients?: { name: string } | null;
  contracts?: { numero: number | null; ano: number | null } | null;
};

export type FechamentoRelatorio = { fechado_em: string; fechado_por_email: string | null } | null | undefined;

type Cor = [number, number, number];
const NOMES_SOCIO: Record<string, string> = { TAC: "Tiago Craveiro", RCMT: "Raphael Corradi", ASS: "Alexandre Souza" };
const ORDEM_SOCIOS = ["TAC", "RCMT", "ASS"];
const CATEGORIAS_HONORARIOS = ["(R) Pró-labore", "(R) Honorários de Êxito", "(R) Honorários de Sucumbência"];
const AZUL: Cor = [20, 36, 58];
const COBRE: Cor = [184, 118, 63];
const BEGE: Cor = [251, 241, 234];
const MARROM: Cor = [122, 74, 40];
const ROTULO: Cor = [138, 143, 152];
const TEXTO: Cor = [52, 58, 68];
const BORDA: Cor = [229, 231, 235];
const VERMELHO: Cor = [180, 35, 24];
const VERDE: Cor = [37, 107, 58];
const ENDERECO = "SCN, Quadra 05, Torre Norte, Sala 217, Ed. Brasília Shopping, Asa Norte, Brasília/DF";
const CONTATO = "contato@sccadvogados.com  |  +55 61 98163-9528";
const ROMANOS = ["I", "II", "III", "IV", "V", "VI"];

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const real = (valor: number) => BRL.format(valor || 0).replace(/ /g, " ");
const data = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const semPrefixo = (categoria: string) => categoria.replace(/^\(([RD])\)\s*/, "");
const sinal = (item: LancamentoRelatorio) => (item.tipo === "entrada" ? 1 : -1) * Number(item.valor);

function agrupar(itens: LancamentoRelatorio[]) {
  const mapa = new Map<string, number>();
  for (const item of itens) mapa.set(semPrefixo(item.categoria), (mapa.get(semPrefixo(item.categoria)) ?? 0) + Number(item.valor));
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

export async function gerarRelatorioMes({
  periodo,
  nomePeriodo,
  lancamentos,
  fechamento,
  hoje,
}: {
  periodo: string; // "AAAA-MM"
  nomePeriodo: string; // "Setembro/2026"
  lancamentos: LancamentoRelatorio[];
  fechamento: FechamentoRelatorio;
  hoje: string; // "AAAA-MM-DD"
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  // ---- Números do mês
  const inicio = `${periodo}-01`;
  const fim = new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const ordenados = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data));
  const saldoInicial = ordenados
    .filter((item) => item.data < inicio || (item.origem === "saldo_inicial" && item.data <= fim))
    .reduce((soma, item) => soma + sinal(item), 0);
  const doMes = ordenados.filter((item) => item.origem !== "saldo_inicial" && item.data >= inicio && item.data <= fim);
  const entradasMes = doMes.filter((item) => item.tipo === "entrada");
  const saidasMes = doMes.filter((item) => item.tipo === "saida");
  const totalEntradas = entradasMes.reduce((s, item) => s + Number(item.valor), 0);
  const totalSaidas = saidasMes.reduce((s, item) => s + Number(item.valor), 0);
  const saldoFinal = saldoInicial + totalEntradas - totalSaidas;
  const distribuicao = saidasMes.filter((item) => item.categoria === "(D) Distribuição de Honorários");
  const porSocio = ORDEM_SOCIOS.map((sigla) => [sigla, distribuicao.filter((item) => item.socio === sigla).reduce((s, item) => s + Number(item.valor), 0)] as const);
  const totalDistribuido = porSocio.reduce((s, [, valor]) => s + valor, 0);
  const revisar = doMes.filter((item) => item.revisar).length;
  const aDistribuir = entradasMes.filter((item) => !item.distribuido && CATEGORIAS_HONORARIOS.includes(item.categoria));

  // ---- Documento
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 16;
  const util = largura - margem * 2;
  const TOPO_PAGINAS = 30; // onde o conteúdo começa nas páginas 2+
  const LIMITE = altura - 26; // acima do rodapé

  const fonte = (estilo: "normal" | "bold", tamanho: number, cor: Cor, espaco = 0) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
    doc.setCharSpace(espaco);
  };
  const etiqueta = (texto: string, xDireita: number, yMeio: number) => {
    fonte("bold", 7.5, AZUL);
    const w = doc.getTextWidth(texto) + 8;
    doc.setFillColor(...BEGE);
    doc.roundedRect(xDireita - w, yMeio - 3.6, w, 7.2, 3.6, 3.6, "F");
    doc.text(texto, xDireita - w / 2, yMeio + 1.1, { align: "center" });
  };
  const cabecalho = () => {
    const alturaLogo = 11;
    doc.addImage(LOGO_SCC.dataUrl, "PNG", margem, 9, (LOGO_SCC.largura / LOGO_SCC.altura) * alturaLogo, alturaLogo);
    etiqueta(`Livro-Caixa · ${nomePeriodo}`, largura - margem, 14.5);
  };

  // ---- Página 1: cabeçalho, chamada, quadro de dados e título
  cabecalho();
  let y = 31;
  fonte("bold", 9, AZUL, 0.2);
  doc.text("LIVRO-CAIXA DO ESCRITÓRIO", margem, y);
  doc.text("PRESTAÇÃO DE CONTAS ENTRE OS SÓCIOS", margem, y + 5);
  y += 10;

  // Quadro de dados (2 linhas x 4 colunas), cantos arredondados
  const celulas: Array<[string, string, Cor?]> = [
    ["PERÍODO", nomePeriodo],
    ["SITUAÇÃO", fechamento ? "Mês Fechado" : "Em Aberto (Prévia)"],
    ["FECHADO EM", fechamento ? data(fechamento.fechado_em) : "—"],
    ["EMITIDO EM", data(hoje)],
    ["SALDO INICIAL", real(saldoInicial)],
    ["ENTRADAS", real(totalEntradas), VERDE],
    ["SAÍDAS", real(totalSaidas), VERMELHO],
    ["SALDO FINAL", real(saldoFinal), saldoFinal < 0 ? VERMELHO : AZUL],
  ];
  const alturaLinha = 14;
  const larguraCol = util / 4;
  doc.setDrawColor(...BORDA);
  doc.setLineWidth(0.3);
  doc.roundedRect(margem, y, util, alturaLinha * 2, 2.5, 2.5, "S");
  doc.line(margem, y + alturaLinha, margem + util, y + alturaLinha);
  for (let c = 1; c < 4; c += 1) doc.line(margem + c * larguraCol, y, margem + c * larguraCol, y + alturaLinha * 2);
  celulas.forEach(([rotulo, valor, cor], i) => {
    const x = margem + (i % 4) * larguraCol + 4;
    const yy = y + Math.floor(i / 4) * alturaLinha;
    fonte("bold", 6.5, ROTULO, 0.6);
    doc.text(rotulo, x, yy + 5);
    fonte("bold", 10, cor ?? AZUL);
    doc.text(valor, x, yy + 10.8);
  });
  y += alturaLinha * 2 + 11;

  // Título com barra cobre
  doc.setFillColor(...COBRE);
  doc.roundedRect(margem, y, 10, 1.4, 0.7, 0.7, "F");
  y += 10;
  fonte("bold", 24, AZUL, -0.2);
  doc.text("Relatório do Mês", margem, y);
  y += 6;
  fonte("normal", 9, TEXTO);
  doc.text(
    fechamento?.fechado_por_email
      ? `Fechado por ${fechamento.fechado_por_email}. Valores conferidos e travados no sistema.`
      : "Mês ainda aberto: os valores podem mudar até o fechamento.",
    margem,
    y,
  );
  y += 9;

  // Resumo no estilo da ementa dos memoriais: rótulo cobre à esquerda e texto com filete à direita
  const qtdRecebimentos = entradasMes.length;
  const resumo =
    `${qtdRecebimentos} recebimento${qtdRecebimentos === 1 ? "" : "s"} somando ${real(totalEntradas)}. ` +
    `Saídas de ${real(totalSaidas)}, das quais ${real(totalDistribuido)} distribuídos aos sócios. ` +
    `Saldo ${saldoFinal >= saldoInicial ? "subiu" : "caiu"} de ${real(saldoInicial)} para ${real(saldoFinal)}.`;
  const xTexto = margem + 42;
  fonte("normal", 8.6, TEXTO);
  const linhasResumo = doc.splitTextToSize(resumo.toUpperCase(), largura - margem - xTexto) as string[];
  fonte("bold", 7, COBRE, 0.8);
  doc.text("RESUMO", margem, y + 3);
  fonte("normal", 8.6, TEXTO);
  doc.text(linhasResumo, xTexto, y + 3, { lineHeightFactor: 1.45 });
  const alturaResumo = linhasResumo.length * 4.4 + 2;
  doc.setDrawColor(...COBRE);
  doc.setLineWidth(0.5);
  doc.line(xTexto - 4, y - 1, xTexto - 4, y - 1 + alturaResumo);
  y += alturaResumo + 7;

  // Pendências em destaque, logo no início
  const pendencias = [
    revisar ? `${revisar} lançamento(s) marcado(s) para revisar.` : "",
    aDistribuir.length ? `${aDistribuir.length} recebimento(s) ainda sem distribuição (${real(aDistribuir.reduce((s, item) => s + Number(item.valor), 0))}).` : "",
  ].filter(Boolean);
  if (pendencias.length) {
    const alturaQuadro = pendencias.length * 5.5 + 9;
    doc.setFillColor(...BEGE);
    doc.roundedRect(margem, y, util, alturaQuadro, 2, 2, "F");
    doc.setFillColor(...COBRE);
    doc.rect(margem, y, 1.2, alturaQuadro, "F");
    fonte("bold", 6.8, MARROM, 0.6);
    doc.text("PENDÊNCIAS DO MÊS", margem + 5, y + 5.5);
    fonte("normal", 8.6, MARROM);
    pendencias.forEach((texto, i) => doc.text(`• ${texto}`, margem + 5, y + 10.5 + i * 5.5));
    y += alturaQuadro + 9;
  } else {
    y += 2;
  }

  // ---- Seções numeradas
  let numero = 0;
  const secao = (titulo: string, subtitulo: string) => {
    if (y > LIMITE - 30) {
      doc.addPage();
      y = TOPO_PAGINAS + 4;
    }
    doc.setFillColor(...AZUL);
    doc.roundedRect(margem, y - 5.2, 8, 8, 1.6, 1.6, "F");
    fonte("bold", 9, [255, 255, 255]);
    doc.text(ROMANOS[numero] ?? String(numero + 1), margem + 4, y + 0.3, { align: "center" });
    numero += 1;
    fonte("bold", 13, AZUL, -0.1);
    doc.text(titulo, margem + 11.5, y);
    fonte("normal", 8, COBRE);
    doc.text(subtitulo, margem + 11.5, y + 4.6);
    y += 9;
  };

  const tabela = {
    theme: "plain" as const,
    margin: { left: margem, right: margem, top: TOPO_PAGINAS, bottom: 24 },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, textColor: TEXTO },
    headStyles: { fontStyle: "bold" as const, fontSize: 6.8, textColor: ROTULO, fillColor: [255, 255, 255] as Cor },
    footStyles: { fontStyle: "bold" as const, textColor: AZUL, fillColor: [250, 247, 243] as Cor },
    // Linhas finas entre as linhas da tabela (sem grade)
    didDrawCell: (dados: { section: string; cell: { x: number; y: number; width: number; height: number } }) => {
      if (dados.section === "foot") return;
      doc.setDrawColor(...BORDA);
      doc.setLineWidth(0.25);
      doc.line(dados.cell.x, dados.cell.y + dados.cell.height, dados.cell.x + dados.cell.width, dados.cell.y + dados.cell.height);
    },
  };
  const direita = (valor: string, cor?: Cor) => ({ content: valor, styles: { halign: "right" as const, ...(cor ? { textColor: cor } : {}) } });
  const cabDireita = (texto: string) => ({ content: texto, styles: { halign: "right" as const } });
  const depois = () => {
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 11;
  };

  secao("Distribuição por Sócio", "Honorários repassados aos sócios no mês");
  autoTable(doc, {
    ...tabela,
    startY: y,
    head: [["SÓCIO", cabDireita("VALOR DISTRIBUÍDO")]],
    body: porSocio.map(([sigla, valor]) => [NOMES_SOCIO[sigla] ?? sigla, direita(real(valor))]),
    foot: [["Total distribuído", direita(real(totalDistribuido))]],
  });
  depois();

  const porCategoria = (titulo: string, subtitulo: string, itens: LancamentoRelatorio[], total: number, cor: Cor) => {
    secao(titulo, subtitulo);
    const linhas = agrupar(itens);
    autoTable(doc, {
      ...tabela,
      startY: y,
      head: [["CATEGORIA", cabDireita("VALOR")]],
      body: linhas.length ? linhas.map(([nome, valor]) => [nome, direita(real(valor), cor)]) : [["Nenhum lançamento", direita("—")]],
      foot: [["Total", direita(real(total))]],
    });
    depois();
  };
  porCategoria("Entradas por Categoria", "Recebimentos registrados no caixa", entradasMes, totalEntradas, VERDE);
  porCategoria("Saídas por Categoria", "Despesas, repasses e distribuições", saidasMes, totalSaidas, VERMELHO);

  secao("Lançamentos do Mês", "Movimentação em ordem de data, com saldo corrido");
  let corrido = saldoInicial;
  const corpo: Array<Array<string | ReturnType<typeof direita>>> = [["", "Saldo inicial", "", "", "", "", direita(real(saldoInicial))]];
  for (const item of doMes) {
    corrido += sinal(item);
    const contrato = item.contracts?.numero != null && item.contracts?.ano != null ? ` · ${String(item.contracts.numero).padStart(3, "0")}/${item.contracts.ano}` : "";
    const nomeSocio = item.socio ? NOMES_SOCIO[item.socio] : undefined;
    const descricao = nomeSocio && item.categoria === "(D) Distribuição de Honorários" && !item.descricao.includes(nomeSocio) ? `${item.descricao} (${nomeSocio})` : item.descricao;
    corpo.push([
      data(item.data),
      descricao,
      semPrefixo(item.categoria),
      item.clients?.name ? `${item.clients.name}${contrato}` : "",
      item.tipo === "entrada" ? direita(real(item.valor), VERDE) : "",
      item.tipo === "saida" ? direita(real(item.valor), VERMELHO) : "",
      direita(real(corrido), corrido < 0 ? VERMELHO : undefined),
    ]);
  }
  autoTable(doc, {
    ...tabela,
    startY: y,
    styles: { ...tabela.styles, fontSize: 7.4 },
    head: [["DATA", "DESCRIÇÃO", "CATEGORIA", "CLIENTE", cabDireita("ENTRADA"), cabDireita("SAÍDA"), cabDireita("SALDO")]],
    body: corpo,
    foot: [["", "Totais do mês", "", "", direita(real(totalEntradas)), direita(real(totalSaidas)), direita(real(saldoFinal))]],
    columnStyles: { 0: { cellWidth: 17 }, 2: { cellWidth: 27 }, 3: { cellWidth: 34 }, 4: { cellWidth: 21 }, 5: { cellWidth: 21 }, 6: { cellWidth: 22 } },
  });
  depois();

  // ---- Cabeçalho (páginas 2+) e rodapé em todas
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    if (pagina > 1) cabecalho();
    fonte("normal", 6.8, ROTULO);
    doc.text(ENDERECO, margem, altura - 12);
    doc.text(CONTATO, margem, altura - 8.5);
    fonte("bold", 7.5, MARROM);
    const texto = `Página ${pagina} de ${total}`;
    const w = doc.getTextWidth(texto) + 8;
    doc.setFillColor(...BEGE);
    doc.roundedRect(largura - margem - w, altura - 14, w, 7, 3.5, 3.5, "F");
    doc.text(texto, largura - margem - w / 2, altura - 9.4, { align: "center" });
  }
  doc.setCharSpace(0);

  return { doc, nomeArquivo: `Relatório do Mês ${periodo} - SCC Advogados.pdf` };
}
