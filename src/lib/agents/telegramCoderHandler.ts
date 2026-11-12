import { callCloudRouter, executeGitHubCodeTask } from "./cloudCoderAgent";

export async function handleTelegramCoderCommand(chatId: number | string, text: string, botToken?: string): Promise<boolean> {
  const clean = text.trim();
  if (!clean.startsWith("/cod") && !clean.startsWith("/ia")) return false;

  const token = botToken || process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const sendMsg = async (msg: string) => {
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    });
  };

  try {
    // Modo 1: /ia <pergunta ou geração de código livre>
    if (clean.startsWith("/ia")) {
      const prompt = clean.replace(/^\/ia\s*/i, "").trim();
      if (!prompt) {
        await sendMsg("Uso: `/ia <instrução técnica ou dúvida de código>`");
        return true;
      }
      await sendMsg("⏳ A processar no Router Cloud (temp 0.0)...");
      const res = await callCloudRouter(prompt);
      await sendMsg(`🤖 [${res.provider}]\n\n${res.text}`);
      return true;
    }

    // Modo 2: /cod <repo> <caminho/ficheiro> | <instrução>
    // Exemplo: /cod zeropaper-frota-bot src/app/page.tsx | Adiciona botão de exportar PDF
    const body = clean.replace(/^\/cod\s*/i, "").trim();
    if (!body.includes("|")) {
      await sendMsg(
        "🛠️ *Agente Cloud Coder (GitHub + Vercel)*\n\n" +
        "Formato para editar código diretamente na nuvem:\n" +
        "`/cod <nome-repo> <caminho-ficheiro> | <instrução>`\n\n" +
        "Exemplo:\n" +
        "`/cod zeropaper-frota-bot src/app/page.tsx | Corrige o título do cabeçalho`\n\n" +
        "Para perguntas rápidas ao router cloud usa:\n" +
        "`/ia <o teu pedido>`"
      );
      return true;
    }

    const [left, ...rightParts] = body.split("|");
    const instruction = rightParts.join("|").trim();
    const parts = left.trim().split(/\s+/);
    const repoInput = parts[0];
    const filePath = parts[1];

    const owner = process.env.GITHUB_OWNER || "";
    const fullRepo = repoInput.includes("/") ? repoInput : `${owner}/${repoInput}`;

    await sendMsg(`⚙️ A ler e editar \`${fullRepo}/${filePath}\` com temperatura 0.0...`);
    const result = await executeGitHubCodeTask({
      repo: fullRepo,
      filePath,
      instruction,
    });

    await sendMsg(result);
    return true;
  } catch (err: any) {
    await sendMsg(`❌ Erro no Cloud Coder: ${err.message || String(err)}`);
    return true;
  }
}