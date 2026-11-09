import "dotenv/config";

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Analisa imagem recebida via Buffer usando Gemini Multimodal Vision
export async function analyzeImageBuffer(imageBuffer, mimeType = "image/jpeg", prompt = "") {
  const geminiKey = process.env.GEMINI_API_KEY || GEMINI_KEY;
  if (!geminiKey) {
    return "⚠️ GEMINI_API_KEY não configurada no servidor.";
  }

  const base64Data = imageBuffer.toString("base64");
  const defaultPrompt =
    prompt ||
    "És o assistente executivo e de desenvolvimento de André Pinheiro. " +
    "Analisa detalhadamente esta imagem em português de Portugal. " +
    "Se for comida ou refeição: identifica ingredientes, estima calorias (Kcal) e gramas de proteína/hidratos/gordura. " +
    "Se for erro, código ou app: aponta a linha, causa e solução técnica em detalhe. " +
    "Se for documento, recibo ou obra: resume os valores, medidas e conclusões práticas.";

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: defaultPrompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ]
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });

    const data = await res.json();
    if (!res.ok) {
      // Fallback 1: gemini-2.0-flash
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
      });
      const fallbackData = await fallbackRes.json();
      if (fallbackRes.ok && fallbackData.candidates?.[0]?.content?.parts?.[0]?.text) {
        return fallbackData.candidates[0].content.parts[0].text;
      }

      // Fallback 2: gemini-1.5-flash
      const fallback15Url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const fallback15Res = await fetch(fallback15Url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
      });
      const fallback15Data = await fallback15Res.json();
      return fallback15Data.candidates?.[0]?.content?.parts?.[0]?.text || `⚠️ Visão IA temporariamente indisponível: ${fallbackData.error?.message || data.error?.message || "Sem resposta"}`;
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível extrair análise da imagem.";
  } catch (err) {
    if (err.name === 'TimeoutError' || err.message?.includes('aborted') || err.message?.includes('timeout')) {
      return "⏱️ A análise da imagem excedeu o limite preventivo de 8 segundos. Tenta novamente com uma imagem mais leve.";
    }
    return `❌ Erro de conexão ao motor de visão: ${err.message}`;
  }
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

