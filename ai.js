// Geração de frases com a API da Anthropic direto do navegador.
// A chave fica salva apenas no navegador de quem a colou (localStorage).
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.135.0/+esm";
const MODELO = "claude-opus-5-5";

const ESQUEMA = {
  "type": "object",
  "properties": {
    "frases": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "frases_com_palavra": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "citacoes_com_palavra": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "manchetes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "citacoes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "jornais": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "assinaturas": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "frases",
    "frases_com_palavra",
    "citacoes_com_palavra",
    "manchetes",
    "citacoes",
    "jornais",
    "assinaturas"
  ],
  "additionalProperties": false
};

const PROMPT = "Você escreve o texto de fundo de um vídeo no estilo \"text match cut\": páginas de jornal que passam muito rápido na tela, com uma palavra destacada no meio.\n\nEscreva tudo em português do Brasil, com acentuação correta, no tom seco e levemente absurdo de notícia de jornal. Exemplos do tom: \"A polícia chegou três horas depois.\" \"Doze pessoas registraram reclamações.\" \"Eles comeram sanduíches.\" \"O presidente chamou a situação de inédita.\"\n\nContexto do vídeo: {contexto}\nPalavra que será destacada: {palavra}\n\nTodo o texto deve girar em torno do contexto: vocabulário, situações, pessoas e lugares ligados a ele.\n\nGere:\n- frases_com_palavra: 40 frases curtas e médias em que a palavra destacada faz parte natural da frase, com a gramática correta para essa palavra (gênero, artigo, preposição). No lugar exato da palavra escreva o marcador {k}, que aparece uma única vez em cada frase. Varie a posição: no começo, no meio e perto do fim. Exemplo para a palavra \"Maria\": \"Segundo testemunhas, {k} saiu pela porta dos fundos.\"\n- citacoes_com_palavra: 15 citações de 8 a 20 palavras, como falas de entrevistados, sem aspas, contendo o marcador {k} uma única vez no lugar da palavra, com a gramática correta.\n- frases: 90 frases curtas e médias (4 a 16 palavras), variadas, cada uma terminando com pontuação.\n- manchetes: 25 manchetes curtas (2 a 6 palavras), começando com letra maiúscula, que façam sentido se a palavra destacada for colocada logo antes delas. Exemplo: para a palavra \"Maria\", a manchete \"foge do zoológico. Cientistas perplexos.\" vira \"Maria foge do zoológico. Cientistas perplexos.\" Escreva-as começando em minúscula, sem a palavra.\n- citacoes: 20 citações de 8 a 20 palavras, como falas de entrevistados, sem aspas.\n- jornais: 10 nomes fictícios e engraçados de jornais, em MAIÚSCULAS (ex.: \"O DIÁRIO CONFUSO\").\n- assinaturas: 10 linhas curtas de crédito de reportagem (ex.: \"Do nosso correspondente infiltrado\").";

let sdkPromise = null;
const loadSdk = () => (sdkPromise ||= import(SDK_URL).then((m) => m.default));

export async function gerarFrasesIA(chave, contexto, palavra) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true });
  let resp;
  try {
    resp = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{
        role: "user",
        content: PROMPT.replace("{contexto}", contexto || "notícias do cotidiano").replace("{palavra}", palavra || "-"),
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Chave da API inválida.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("Essa chave não tem permissão para usar o modelo.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Limite de uso da API atingido. Tente de novo em instantes.");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Não foi possível conectar à API da Anthropic.");
    if (e instanceof Anthropic.APIError) throw new Error(`Erro da API (${e.status}): ${e.message}`);
    throw e;
  }
  if (resp.stop_reason === "refusal") throw new Error("A IA recusou esse contexto. Tente descrever de outra forma.");
  if (resp.stop_reason === "max_tokens") throw new Error("A resposta veio incompleta. Tente de novo.");
  const texto = resp.content.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(texto);
}

window.gerarFrasesIA = gerarFrasesIA;
