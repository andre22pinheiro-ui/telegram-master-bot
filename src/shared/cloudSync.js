import "dotenv/config";
import fs from "fs";
import path from "path";

/**
 * MOTOR DE SINCRONIZAÇÃO HÍBRIDA NUVEM <-> LOCAL (CLOUD-SYNC ENGINE)
 * 
 * 1. Em Operação:
 *    - Quando tu ou a tua mulher adicionam compras, tarefas, horários da bebé ou notas,
 *      o sistema guarda imediatamente no ficheiro local e sincroniza em background na NUVEM (Telegram Cloud Backup Channel / KV).
 * 
 * 2. Quando o PC Liga / Reinicia:
 *    - O sistema arranca, faz pull da versão mais recente guardada na Nuvem,
 *      e atualiza a base de dados local SQLite / JSON garantindo que não perdes nada do que foi registado
 *      enquanto o PC esteve desligado!
 */

const LOCAL_BACKUP_PATH = path.resolve("./data_cloud_sync.json");
const TELEGRAM_TOKEN = process.env.TELEGRAM_MASTER_TOKEN;
const SYNC_CHAT_ID = process.env.AUTHORIZED_CHAT_ID || "950415577";

let syncDebounceTimer = null;

// Ler estado local
export function getLocalSyncData() {
  try {
    if (fs.existsSync(LOCAL_BACKUP_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_BACKUP_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[CLOUD SYNC] Erro ao ler backup local:", err.message);
  }
  return { version: "1.0", lastSync: null, shopping: [], tasks: [], baby_logs: [], notes: [] };
}

// Gravar localmente
export function saveLocalSyncData(data) {
  try {
    data.lastSync = new Date().toISOString();
    fs.writeFileSync(LOCAL_BACKUP_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[CLOUD SYNC] Erro ao gravar backup local:", err.message);
  }
}

/**
 * SINCRONIZAR PARA A NUVEM:
 * Envia o snapshot codificado para o armazenamento privado do Telegram Cloud via Bot API.
 * Gratuito, permanente, sem limites de expiração.
 */
export async function pushToCloud(data) {
  if (!TELEGRAM_TOKEN || !SYNC_CHAT_ID) return;

  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    try {
      const payloadString = JSON.stringify(data);
      const buffer = Buffer.from(payloadString, "utf-8");
      const boundary = "----CloudSyncBoundary" + Date.now();

      const blobHeader = 
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="chat_id"\r\n\r\n${SYNC_CHAT_ID}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="caption"\r\n\r\n#CLOUD_SYNC_BACKUP_${Date.now()}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="document"; filename="cloud_sync_state.json"\r\n` +
        `Content-Type: application/json\r\n\r\n`;

      const blobFooter = `\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([
        Buffer.from(blobHeader, "utf-8"),
        buffer,
        Buffer.from(blobFooter, "utf-8")
      ]);

      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body
      });

      const resData = await res.json();
      if (resData.ok) {
        console.log("☁️ [CLOUD SYNC] Sincronização na nuvem concluída com sucesso (Telegram Cloud Doc ID:", resData.result.message_id, ")");
      }
    } catch (err) {
      console.warn("⚠️ [CLOUD SYNC] Falha no push de backup na nuvem:", err.message);
    }
  }, 3000); // Debounce de 3 segundos para evitar floods
}

/**
 * SINCRONIZAR DA NUVEM (QUANDO O PC ARRANCA):
 * Vai à nuvem do Telegram, pesquisa pelo último ficheiro guardado e restaura para o disco local.
 */
export async function pullFromCloudOnStartup() {
  if (!TELEGRAM_TOKEN || !SYNC_CHAT_ID) return false;

  console.log("🔄 [CLOUD SYNC] A verificar existência de backups mais recentes na Nuvem...");
  try {
    // Obter histórico recente de atualizações
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?limit=20`);
    const data = await res.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      console.log("ℹ️ [CLOUD SYNC] Nenhum snapshot pendente na fila. A manter estado local consistente.");
      return false;
    }

    // Encontrar último documento de backup
    const syncDocMsg = data.result
      .map(u => u.message)
      .filter(m => m && m.document && m.document.file_name === "cloud_sync_state.json")
      .pop();

    if (syncDocMsg) {
      const fileId = syncDocMsg.document.file_id;
      const fileMetaRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
      const fileMeta = await fileMetaRes.json();

      if (fileMeta.ok && fileMeta.result?.file_path) {
        const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileMeta.result.file_path}`;
        const contentRes = await fetch(downloadUrl);
        const cloudJson = await contentRes.json();

        saveLocalSyncData(cloudJson);
        console.log("✅ [CLOUD SYNC] Estado da nuvem descarregado com sucesso para o disco local!");
        return cloudJson;
      }
    }
  } catch (err) {
    console.warn("⚠️ [CLOUD SYNC] Erro ao sincronizar a partir da nuvem:", err.message);
  }
  return false;
}

