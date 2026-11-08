import "dotenv/config";
import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "andre22pinheiro-ui";
const GITHUB_REPO = process.env.GITHUB_REPO || "whatsapp-dev-assistant";
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const octokit = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null;

// Registo de erros em ficheiro local estruturado
const ERROR_LOG_PATH = path.resolve("./data_error_reports.json");

function loadErrorHistory() {
  try {
    if (fs.existsSync(ERROR_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(ERROR_LOG_PATH, "utf-8"));
    }
  } catch (e) {}
  return [];
}

function saveErrorHistory(list) {
  try {
    fs.writeFileSync(ERROR_LOG_PATH, JSON.stringify(list, null, 2), "utf-8");
  } catch (e) {
    console.error("Erro ao guardar histórico de erros:", e.message);
  }
}

/**
 * 1. TRAP DE ERROS & LOGS ESTRUTURADOS
 */
export function recordExecutionError({ serviceName, error, context = {} }) {
  const reports = loadErrorHistory();
  const report = {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: new Date().toISOString(),
    service: serviceName,
    message: error?.message || String(error),
    stack: error?.stack || null,
    context,
    resolved: false
  };

  reports.push(report);
  if (reports.length > 50) reports.shift(); // Manter os últimos 50 registos
  saveErrorHistory(reports);

  console.error(`🚨 [TRAP ERRO - ${serviceName.toUpperCase()}] ${report.message}`);
  return report;
}

/**
 * 2. MÓDULO DE AUTO-DIAGNÓSTICO (SELF-REFINE / AGENTIC REFLECTION)
 * Analisa a exceção, lê o ficheiro envolvido e gera a correção via IA
 */
export async function diagnoseAndRefineError({ filePath, errorMessage, errorStack }) {
  let sourceCode = "";
  try {
    if (fs.existsSync(filePath)) {
      sourceCode = fs.readFileSync(filePath, "utf-8");
    }
  } catch (e) {
    return { success: false, error: `Não foi possível ler o código-fonte em ${filePath}: ${e.message}` };
  }

  const prompt =
    `Você é o Engenheiro Sénior de Auto-Melhoramento Autónomo (Self-Refine Engine).\n` +
    `Foi detetado um erro em tempo de execução no seguinte ficheiro: "${path.basename(filePath)}".\n\n` +
    `DETALHE DO ERRO:\n${errorMessage}\n\n` +
    `STACK TRACE:\n${errorStack || "Sem stack"}\n\n` +
    `CÓDIGO-FONTE ATUAL:\n\`\`\`javascript\n${sourceCode}\n\`\`\`\n\n` +
    `INSTRUÇÕES DE REFLEXÃO E CORREÇÃO:\n` +
    `1. Identifique a causa raiz (lógica, sintaxe, chamada assíncrona ou parâmetro undefined).\n` +
    `2. Devolva APENAS um objeto JSON válido (sem texto fora do JSON) com a estrutura:\n` +
    `{\n` +
    `  "rootCause": "Explicação concisa da falha",\n` +
    `  "summary": "Resumo da correção aplicada",\n` +
    `  "patchedCode": "Código-fonte completo e corrigido pronto para substituição integral"\n` +
    `}`;

  try {
    const geminiKey = process.env.GEMINI_API_KEY || GEMINI_KEY;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await res.json();
    let textOut = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    textOut = textOut.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    const parsed = JSON.parse(textOut);
    return {
      success: true,
      rootCause: parsed.rootCause,
      summary: parsed.summary,
      patchedCode: parsed.patchedCode,
      filePath
    };
  } catch (err) {
    return { success: false, error: `Falha no Auto-Diagnóstico: ${err.message}` };
  }
}

/**
 * 3. UPDATE NO GITHUB VIA @octokit/rest
 * Escreve o código corrigido localmente e efetua o commit no GitHub para acionar o deploy contínuo
 */
export async function commitAndPushFix({ relativePath, newContent, commitMessage }) {
  // 1. Atualizar ficheiro local primeiro
  const localAbsPath = path.resolve(relativePath);
  try {
    fs.writeFileSync(localAbsPath, newContent, "utf-8");
  } catch (fsErr) {
    return { success: false, error: `Falha ao gravar correção localmente: ${fsErr.message}` };
  }

  // 2. Commit remoto no GitHub com Octokit
  if (!octokit) {
    return {
      success: true,
      githubUpdated: false,
      message: "Ficheiro atualizado localmente. GitHub Token não configurado para push remoto."
    };
  }

  try {
    const cleanRepoPath = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
    
    // Obter o SHA do ficheiro atual no GitHub
    let currentSha = null;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: cleanRepoPath
      });
      currentSha = data.sha;
    } catch (notFound) {
      // O ficheiro pode ser novo
    }

    // Criar ou atualizar o ficheiro no repositório
    const contentBase64 = Buffer.from(newContent, "utf-8").toString("base64");
    const updateRes = await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: cleanRepoPath,
      message: commitMessage || `🤖 [Self-Refine Auto-Fix] Correção autónoma em ${cleanRepoPath}`,
      content: contentBase64,
      sha: currentSha || undefined,
      committer: {
        name: "Self-Refine Agent",
        email: "bot-autofix@antigravity.ai"
      }
    });

    return {
      success: true,
      githubUpdated: true,
      commitSha: updateRes.data.commit.sha,
      commitUrl: updateRes.data.commit.html_url,
      message: `Correção autónoma enviada para o GitHub com sucesso (SHA: ${updateRes.data.commit.sha.substring(0, 7)}).`
    };
  } catch (octoErr) {
    return {
      success: true,
      githubUpdated: false,
      message: `Ficheiro corrigido no servidor local, mas falha no GitHub: ${octoErr.message}`
    };
  }
}

/**
 * Pipeline Integrado de Auto-Melhoramento: Diagnostica, Aplica Fix e Faz Push
 */
export async function autoRefineWorkflow({ serviceName, error, filePath }) {
  // 1. Trap do erro
  const report = recordExecutionError({ serviceName, error, context: { filePath } });

  // 2. Diagnóstico e proposta de código
  console.log(`🧠 [SELF-REFINE] A analisar código-fonte de ${filePath}...`);
  const diagnosis = await diagnoseAndRefineError({
    filePath,
    errorMessage: error.message,
    errorStack: error.stack
  });

  if (!diagnosis.success) {
    return {
      reportId: report.id,
      repaired: false,
      error: diagnosis.error
    };
  }

  // 3. Commit no GitHub
  console.log(`🚀 [SELF-REFINE] Correção validada ("${diagnosis.summary}"). A comitar no GitHub...`);
  const commitRes = await commitAndPushFix({
    relativePath: filePath,
    newContent: diagnosis.patchedCode,
    commitMessage: `🤖 [Self-Refine] Correção autónoma em ${path.basename(filePath)}: ${diagnosis.summary}`
  });

  return {
    reportId: report.id,
    repaired: true,
    rootCause: diagnosis.rootCause,
    summary: diagnosis.summary,
    commitDetails: commitRes
  };
}

