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

// Configurações lidas do .env
const GOOGLE_SA_KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_CREDENTIALS_JSON;
const GOOGLE_SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
export const DEFAULT_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '19QWucMs263vBHjswpoeG79TKlha603Cj';

// Cache do token em memória
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Carrega a chave de conta de serviço (Service Account) se disponível.
 */
export function getServiceAccountCredentials() {
  if (GOOGLE_SA_KEY_RAW) {
    try {
      const trimmed = GOOGLE_SA_KEY_RAW.trim();
      const jsonStr = trimmed.startsWith('{')
        ? trimmed
        : Buffer.from(trimmed, 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    } catch (e) {
      log.error('Erro ao interpretar GOOGLE_SERVICE_ACCOUNT_KEY:', e.message);
    }
  }

  if (GOOGLE_SA_PATH && existsSync(GOOGLE_SA_PATH)) {
    try {
      return JSON.parse(readFileSync(GOOGLE_SA_PATH, 'utf-8'));
    } catch (e) {
      log.error('Erro ao ler GOOGLE_SERVICE_ACCOUNT_PATH:', e.message);
    }
  }

  const defaultPaths = [
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
  { name: 'autorizados.json', path: './data/autorizados.json' },
  { name: 'conversas_historico.json', path: './data/conversas_historico.json' },
  { name: 'family_store.json', path: './data/family_store.json' },
  { name: 'imoveis_amarante.db', path: './data/imoveis_amarante.db' }
];

/**
 * Restaura todos os ficheiros críticos do Google Drive para o disco local durante o arranque do servidor.
 */
export async function restoreAllFromDrive(folderId = DEFAULT_DRIVE_FOLDER_ID) {
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
      if (ok) restoredCount++;
    } else {
      log.debug(`Ficheiro [${item.name}] não encontrado no Drive; mantém-se a versão local se existir.`);
    }
  }

  log.info(`🏁 Restauro do Google Drive concluído (${restoredCount}/${CRITICAL_FILES.length} ficheiros restaurados).`);
  return restoredCount > 0;
}

/**
 * Sincroniza todos os ficheiros críticos locais para o Google Drive.
 */
export async function syncAllToDrive(folderId = DEFAULT_DRIVE_FOLDER_ID) {
  if (!isDriveConfigured()) return false;

  log.info('☁️ A sincronizar ficheiros críticos para o Google Drive...');
  let synced = 0;

  for (const item of CRITICAL_FILES) {
    const localPath = path.resolve(ROOT_DIR, item.path);
    if (existsSync(localPath)) {
      const res = await uploadOrUpdateFileInDrive({
        filePath: localPath,
        fileName: item.name,
        folderId
      });
      if (res) synced++;
    }
  }

  log.info(`✅ Sincronização para o Google Drive terminada (${synced}/${CRITICAL_FILES.length} sincronizados).`);
  return synced > 0;
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
  }, ms);

  log.info(`⏰ Sincronizador persistente do Google Drive ativo (a cada ${intervalMinutes} minutos).`);
}

/**
 * Função mantida para retrocompatibilidade com comandos de backup manual (/backup).
 */
export async function backupDatabaseToDrive() {
  return syncAllToDrive();
}
