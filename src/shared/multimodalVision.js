import "dotenv/config";

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Analisa imagem recebida via Buffer usando Gemini Multimodal Vision
export async function analyzeImageBuffer(imageBuffer, mimeType = "image/jpeg", prompt = "") {
  const geminiKey = process.env.GEMINI_API_KEY || GEMINI_KEY;
  if (!geminiKey) {
    return "⚠️ GEMINI_API_KEY não configurada no servidor.";
  }

  const base64Data = imageBuffer.toString("base64");
  const cleanMime = mimeType.split(";")[0].trim();
  const defaultPrompt =
    prompt ||
    "És o assistente executivo e de engenharia sénior de André Pinheiro, em conformidade com o EU AI Act e RGPD. " +
    "Analisa detalhadamente esta imagem em português de Portugal de forma rigorosa, factual e sem delírios. " +
    "Se for comida ou refeição: identifica ingredientes reais, estima calorias (Kcal) e gramas de proteína/hidratos/gordura com base em tabelas nutricionais (EFSA). " +
    "Se for erro, código ou app: aponta a linha, causa e solução técnica em detalhe. " +
    "Se for documento, recibo ou obra: resume os valores, medidas e conclusões práticas.";

  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: cleanMime,
              data: base64Data
            }
          },
          {
            text: defaultPrompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024
    }
  };

  const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": geminiKey
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });

      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (res.ok && reply && reply.trim().length > 0) {
        return reply.trim();
      }
    } catch (err) {
      // Tentar próximo modelo na lista
    }
  }

  return "⚠️ Análise de imagem temporariamente indisponível. Tenta novamente em instantes.";
}

// Descarregar ficheiro do Telegram dado o file_id
export async function downloadTelegramPhoto(telegram, fileId, botToken) {
  try {
    const fileLink = await telegram.getFileLink(fileId);
    const downloadUrl = fileLink.href || String(fileLink);
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Falha no download Telegram: ${res.statusText}`);
    const arrayBuf = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      downloadUrl,
      fileId
    };
  } catch (e) {
    console.error("Erro ao descarregar foto do Telegram:", e);
    return null;
  }
}

