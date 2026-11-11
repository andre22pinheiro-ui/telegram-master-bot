// src/services/googleDriveService.js — Gestor de Armazenamento e Backups Persistentes no Google Drive
import crypto from 'crypto';
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('GoogleDrive');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../');

// Configurações padrão (tokens e caminhos são resolvidos dinamicamente em runtime)
export const DEFAULT_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '19QWucMs263vBHjswpoeG79TKlha603Cj';

// Cache do token em memória
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Carrega a chave de conta de serviço (Service Account) dinamicamente do env ou disco.
 */
export function getServiceAccountCredentials() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_CREDENTIALS_JSON;
  if (rawKey) {
    try {
      const trimmed = rawKey.trim();
      const jsonStr = trimmed.startsWith('{')
        ? trimmed
        : Buffer.from(trimmed, 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    } catch (e) {
      log.error('Erro ao interpretar GOOGLE_SERVICE_ACCOUNT_KEY:', e.message);
    }
  }

  const envPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (envPath && existsSync(envPath)) {
    try {
      return JSON.parse(readFileSync(envPath, 'utf-8'));
    } catch (e) {
      log.error('Erro ao ler GOOGLE_SERVICE_ACCOUNT_PATH:', e.message);
    }
  }

  const defaultPaths = [
    '/etc/secrets/service-account.json',
    path.resolve(ROOT_DIR, 'service-account.json'),
    path.resolve(ROOT_DIR, 'google-credentials.json'),
    path.resolve(ROOT_DIR, 'credentials.json'),
    path.resolve('./service-account.json')
  ];

  for (const p of defaultPaths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8'));
      } catch (e) {
        log.warn(`Ficheiro encontrado em ${p} mas inválido:`, e.message);
      }
    }
  }

  return null;
}

/**
 * Verifica se o Google Drive está devidamente configurado com credenciais válidas.
 */
export function isDriveConfigured() {
  const sa = getServiceAccountCredentials();
  return Boolean(sa && sa.client_email && sa.private_key);
}

/**
 * Obtém um Access Token válido da Google OAuth2 via JWT Bearer (RS256).
 */
export async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  const sa = getServiceAccountCredentials();
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error('Credenciais da Service Account da Google não configuradas.');
  }

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64UrlPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsignedToken = `${base64UrlHeader}.${base64UrlPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  const signature = signer.sign(sa.private_key, 'base64url');
  const jwt = `${unsignedToken}.${signature}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', jwt);

  const res = await axios.post(sa.token_uri || 'https://oauth2.googleapis.com/token', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  cachedToken = res.data.access_token;
  tokenExpiresAt = now + (res.data.expires_in || 3600);
  log.info('Access Token do Google Drive renovado com sucesso.');
  return cachedToken;
}

/**
 * Pesquisa um ficheiro pelo nome dentro da pasta especificada.
 */
export async function findFileInFolder(fileName, folderId = DEFAULT_DRIVE_FOLDER_ID) {
  try {
    const token = await getAccessToken();
    const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
        fields: 'files(id, name, modifiedTime, size)'
      }
    });
    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0];
    }
  } catch (err) {
    log.error(`Erro ao pesquisar ficheiro ${fileName} no Drive:`, err.message);
  }
  return null;
}

/**
 * Transfere um ficheiro do Google Drive para o disco local.
 */
export async function downloadFileFromDrive(fileId, localDestinationPath) {
  try {
    const token = await getAccessToken();
    const res = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer'
    });

    const dir = path.dirname(localDestinationPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    writeFileSync(localDestinationPath, Buffer.from(res.data));
    log.info(`✅ Ficheiro restaurado do Google Drive: ${path.basename(localDestinationPath)} (${res.data.byteLength} bytes)`);
    return true;
  } catch (err) {
    log.error(`Erro ao descarregar ficheiro ${fileId} do Drive:`, err.message);
    return false;
  }
}

/**
 * Atualiza um ficheiro existente no Google Drive ou tenta criar se for novo.
 */
export async function uploadOrUpdateFileInDrive({ filePath, fileName, folderId = DEFAULT_DRIVE_FOLDER_ID }) {
  if (!existsSync(filePath)) {
    log.warn(`Ficheiro local não encontrado para upload: ${filePath}`);
    return null;
  }

  const token = await getAccessToken();
  const targetName = fileName || path.basename(filePath);
  const fileContent = readFileSync(filePath);

  // 1. Verificar se o ficheiro já existe na pasta
  const existing = await findFileInFolder(targetName, folderId);

  if (existing) {
    // Atualização in-place (PATCH) — utiliza a quota do dono original do ficheiro!
    try {
      const updateRes = await axios.patch(
        `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
        fileContent,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream'
          }
        }
      );
      log.info(`☁️ Ficheiro sincronizado no Drive (atualizado): ${targetName} [ID: ${existing.id}]`);
      return updateRes.data;
    } catch (patchErr) {
      log.error(`Falha ao atualizar ${targetName} no Drive:`, patchErr.message);
      return null;
    }
  }

  // 2. Se o ficheiro não existe, tenta criar
  try {
    const metadata = {
      name: targetName,
      parents: [folderId]
    };
    const boundary = '-------DriveSyncBoundary' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const multipartBody = Buffer.concat([
      Buffer.from(
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/octet-stream\r\n\r\n'
      ),
      fileContent,
      Buffer.from(closeDelimiter)
    ]);

    const createRes = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      multipartBody,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        }
      }
    );
    log.info(`✅ Novo ficheiro criado com sucesso no Google Drive: ${targetName} (ID: ${createRes.data.id})`);
    return createRes.data;
  } catch (createErr) {
    if (createErr.response?.data?.error?.reason === 'storageQuotaExceeded' || createErr.response?.status === 403) {
      log.warn(
        `⚠️ Google Drive Quota: A Service Account tem 0 bytes de quota direta para criar novos ficheiros em drives pessoais. ` +
        `Para ativar a persistência total de "${targetName}", coloque uma primeira cópia deste ficheiro na pasta "Backups Telegram Bot" ` +
        `(ID: ${folderId}). A partir daí, as atualizações serão 100% automáticas via PATCH!`
      );
    } else {
      log.error(`Erro ao criar ${targetName} no Drive:`, createErr.message);
    }
    return null;
  }
}

/**
 * Ficheiros críticos a sincronizar com a nuvem (Google Drive).
 */
export const CRITICAL_FILES = [
  { name: 'pessoal_master.db', path: './data/pessoal_master.db' },
  { name: 'autorizados.json', path: './data/autorizados.json' }
];

// Estado telemetrico do sincronizador Google Drive
const driveSyncState = {
  lastRestoreAt: null,
  lastRestoreCount: 0,
  lastSyncAt: null,
  lastSyncOk: null,
  lastSyncedCount: 0,
  lastError: null
};

export function getDriveSyncStatus() {
  return {
    configured: isDriveConfigured(),
    folderId: DEFAULT_DRIVE_FOLDER_ID,
    ...driveSyncState
  };
}

/**
 * Restaura todos os ficheiros críticos do Google Drive para o disco local durante o arranque do servidor.
 * NOTA: Deve correr ANTES de sqliteMasterDb.getDb() para evitar handles abertos num ficheiro antigo.
 */
export async function restoreAllFromDrive(folderId = DEFAULT_DRIVE_FOLDER_ID) {
  if (process.env.DISABLE_DRIVE_SYNC === 'true') {
    return false;
  }
  if (!isDriveConfigured()) {
    log.warn('Google Drive não configurado; arranque prossegue com dados locais.');
    return false;
  }

  log.info(`🔄 A verificar e restaurar dados persistentes do Google Drive (Pasta: ${folderId})...`);
  let restoredCount = 0;

  for (const item of CRITICAL_FILES) {
    const localTarget = path.resolve(ROOT_DIR, item.path);
    const remoteFile = await findFileInFolder(item.name, folderId);

    if (remoteFile) {
      log.info(`📥 A descarregar [${item.name}] da nuvem (modificado: ${remoteFile.modifiedTime})...`);
      const ok = await downloadFileFromDrive(remoteFile.id, localTarget);
      if (ok) {
        restoredCount++;
        // Remover WAL/SHM antigos caso existam antes de reabrir SQLite
        if (item.name === 'pessoal_master.db') {
          try {
            const { unlinkSync } = await import('fs');
            if (existsSync(`${localTarget}-wal`)) unlinkSync(`${localTarget}-wal`);
            if (existsSync(`${localTarget}-shm`)) unlinkSync(`${localTarget}-shm`);
          } catch {}
        }
      }
    } else {
      log.debug(`Ficheiro [${item.name}] não encontrado no Drive; mantém-se a versão local se existir.`);
    }
  }

  driveSyncState.lastRestoreAt = new Date().toISOString();
  driveSyncState.lastRestoreCount = restoredCount;
  log.info(`🏁 Restauro do Google Drive concluído (${restoredCount}/${CRITICAL_FILES.length} ficheiros restaurados).`);
  return restoredCount > 0;
}

/**
 * Boot Restore Obrigatório: garante restauro do Google Drive antes de abrir a porta HTTP.
 */
export async function initCloudPersistence(folderId = DEFAULT_DRIVE_FOLDER_ID) {
  try {
    return await restoreAllFromDrive(folderId);
  } catch (err) {
    driveSyncState.lastError = err.message;
    log.error('Falha em initCloudPersistence:', err.message);
    return false;
  }
}

/**
 * Sincroniza todos os ficheiros críticos locais para o Google Drive.
 */
export async function syncAllToDrive(folderId = DEFAULT_DRIVE_FOLDER_ID) {
  if (process.env.DISABLE_DRIVE_SYNC === 'true' || !isDriveConfigured()) return false;

  log.info('☁️ A sincronizar ficheiros críticos para o Google Drive...');
  let synced = 0;

  try {
    for (const item of CRITICAL_FILES) {
      const localPath = path.resolve(ROOT_DIR, item.path);
      if (existsSync(localPath)) {
        if (item.name === 'pessoal_master.db') {
          try {
            const { checkpointMasterDb } = await import('../shared/sqliteMasterDb.js');
            checkpointMasterDb?.();
          } catch (_) {}
        }
        const res = await uploadOrUpdateFileInDrive({
          filePath: localPath,
          fileName: item.name,
          folderId
        });
        if (res) synced++;
      }
    }

    driveSyncState.lastSyncAt = new Date().toISOString();
    driveSyncState.lastSyncOk = synced > 0;
    driveSyncState.lastSyncedCount = synced;
    driveSyncState.lastError = null;
    log.info(`✅ Sincronização para o Google Drive terminada (${synced}/${CRITICAL_FILES.length} sincronizados).`);
    return synced > 0;
  } catch (err) {
    driveSyncState.lastSyncAt = new Date().toISOString();
    driveSyncState.lastSyncOk = false;
    driveSyncState.lastError = err.message;
    log.error('Erro em syncAllToDrive:', err.message);
    return false;
  }
}

let debouncedSyncTimer = null;

/**
 * Hook Write-Through Cloud Sync: envia pessoal_master.db e autorizados.json para o Drive
 * após delayMs (padrão 5000ms = 5s) da última escrita em tabelas críticas.
 */
export function triggerCloudSyncDebounced(delayMs = 5000, folderId = DEFAULT_DRIVE_FOLDER_ID) {
  if (process.env.DISABLE_DRIVE_SYNC === 'true' || process.env.NODE_ENV === 'test') {
    return false;
  }
  if (!isDriveConfigured()) return false;

  if (debouncedSyncTimer) {
    clearTimeout(debouncedSyncTimer);
  }
  log.debug(`⏳ Write-Through Google Drive agendado para daqui a ${delayMs / 1000}s.`);
  debouncedSyncTimer = setTimeout(async () => {
    try {
      log.info('🚀 A executar sincronização Write-Through no Google Drive...');
      await syncAllToDrive(folderId);
    } catch (err) {
      log.error('Erro na sincronização Write-Through:', err.message);
    } finally {
      debouncedSyncTimer = null;
    }
  }, delayMs);
  debouncedSyncTimer.unref?.();
  return true;
}

/**
 * Retrocompatibilidade para chamadas existentes.
 */
export function triggerDebouncedDriveSync(delayMs = 5000, folderId = DEFAULT_DRIVE_FOLDER_ID) {
  return triggerCloudSyncDebounced(delayMs, folderId);
}

/**
 * Inicia o agendador de sincronização periódica (ex: a cada 15 minutos).
 */
export function startAutoDriveSync(intervalMinutes = 15, folderId = DEFAULT_DRIVE_FOLDER_ID) {
  if (!isDriveConfigured()) return;

  const ms = intervalMinutes * 60 * 1000;
  setInterval(async () => {
    try {
      await syncAllToDrive(folderId);
    } catch (err) {
      log.error('Erro no ciclo de sincronização automática com o Google Drive:', err.message);
    }
  }, ms).unref?.();

  log.info(`⏰ Sincronizador persistente do Google Drive ativo (a cada ${intervalMinutes} minutos).`);
}

/**
 * Função mantida para retrocompatibilidade com comandos de backup manual (/backup).
 */
export async function backupDatabaseToDrive() {
  if (!isDriveConfigured()) {
    return { success: false, error: 'Google Drive não configurado.' };
  }
  const ok = await syncAllToDrive();
  return {
    success: ok,
    timestamp: new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }),
    files: CRITICAL_FILES.map((f) => ({ name: f.name, link: `https://drive.google.com/drive/folders/${DEFAULT_DRIVE_FOLDER_ID}` })),
    error: driveSyncState.lastError
  };
}
