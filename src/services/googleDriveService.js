// src/services/googleDriveService.js — Gestor de Armazenamento e Backups no Google Drive
import crypto from 'crypto';
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('GoogleDrive');

// Configurações lidas do .env
const GOOGLE_SA_KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_CREDENTIALS_JSON;
const GOOGLE_SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; // Opcional: ID da pasta no Drive

// Cache do token em memória
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Carrega a chave de conta de serviço (Service Account) se disponível.
 */
function getServiceAccountCredentials() {
  if (GOOGLE_SA_KEY_RAW) {
    try {
      // Se for base64, descodifica; senão faz parse direto do JSON
      const jsonStr = GOOGLE_SA_KEY_RAW.trim().startsWith('{')
        ? GOOGLE_SA_KEY_RAW
        : Buffer.from(GOOGLE_SA_KEY_RAW, 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    } catch (e) {
      log.error('Erro ao interpretar GOOGLE_SERVICE_ACCOUNT_KEY do .env:', e.message);
    }
  }

  if (GOOGLE_SA_PATH && existsSync(GOOGLE_SA_PATH)) {
    try {
      return JSON.parse(readFileSync(GOOGLE_SA_PATH, 'utf-8'));
    } catch (e) {
      log.error('Erro ao ler GOOGLE_SERVICE_ACCOUNT_PATH:', e.message);
    }
  }

  // Verifica ficheiro padrão credentials.json ou service-account.json na raiz
  const defaultPaths = [
    path.resolve('./google-credentials.json'),
    path.resolve('./service-account.json'),
    path.resolve('./credentials.json')
  ];

  for (const p of defaultPaths) {
    if (existsSync(p)) {
      try {
        log.info(`Chave de Service Account detetada em: ${p}`);
        return JSON.parse(readFileSync(p, 'utf-8'));
      } catch (e) {
        log.warn(`Ficheiro encontrado em ${p} mas inválido:`, e.message);
      }
    }
  }

  return null;
}

/**
 * Verifica se o Google Drive está devidamente configurado.
 */
export function isDriveConfigured() {
  return !!getServiceAccountCredentials();
}

/**
 * Obtém um Access Token válido da Google OAuth2 via JWT Bearer (RS256).
 */
async function getAccessToken() {
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
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
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
  log.info('Novo Access Token do Google Drive obtido com sucesso!');
  return cachedToken;
}

/**
 * Cria uma pasta no Google Drive caso não exista.
 */
export async function getOrCreateFolder(folderName = 'TelegramBot_Nuvem') {
  const token = await getAccessToken();

  // Pesquisar se a pasta já existe
  const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  const listRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
    headers: { Authorization: `Bearer ${token}` },
    params: { q, fields: 'files(id, name)' }
  });

  if (listRes.data.files && listRes.data.files.length > 0) {
    return listRes.data.files[0].id;
  }

  // Criar nova pasta
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (GOOGLE_DRIVE_FOLDER_ID) {
    folderMetadata.parents = [GOOGLE_DRIVE_FOLDER_ID];
  }

  const createRes = await axios.post('https://www.googleapis.com/drive/v3/files', folderMetadata, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  log.info(`Pasta criada no Google Drive: ${folderName} (ID: ${createRes.data.id})`);
  return createRes.data.id;
}

/**
 * Envia um ficheiro local para o Google Drive.
 */
export async function uploadFileToDrive({ filePath, fileName, mimeType = 'application/octet-stream', folderName = 'TelegramBot_Nuvem' }) {
  if (!existsSync(filePath)) {
    throw new Error(`Ficheiro não encontrado: ${filePath}`);
  }

  const token = await getAccessToken();
  const folderId = await getOrCreateFolder(folderName);
  const fileContent = readFileSync(filePath);
  const targetName = fileName || path.basename(filePath);

  const metadata = {
    name: targetName,
    parents: [folderId]
  };

  const boundary = '-------GoogleDriveUploadBoundary' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n`
    ),
    fileContent,
    Buffer.from(closeDelimiter)
  ]);

  const res = await axios.post(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,size',
    multipartBody,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      }
    }
  );

  log.info(`Ficheiro enviado para o Google Drive: ${targetName} (ID: ${res.data.id})`);
  return res.data;
}

/**
 * Faz backup de emergência ou agendado da base de dados e listas para o Google Drive.
 */
export async function backupDatabaseToDrive() {
  if (!isDriveConfigured()) {
    return {
      success: false,
      message: 'Google Drive ainda não está configurado com credenciais no .env.'
    };
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uploaded = [];

    // 1. Base de dados SQLite
    const dbPaths = [
      path.resolve('./family.db'),
      path.resolve('./data/family.db'),
      path.resolve('./data_central.json')
    ];

    for (const p of dbPaths) {
      if (existsSync(p)) {
        const ext = path.extname(p);
        const name = `backup_${path.basename(p, ext)}_${timestamp}${ext}`;
        const fileInfo = await uploadFileToDrive({
          filePath: p,
          fileName: name,
          folderName: 'TelegramBot_Backups'
        });
        uploaded.push({ name, link: fileInfo.webViewLink });
      }
    }

    // 2. Lista M3U de Portugal
    const m3uPath = existsSync(path.resolve('./public/portugal.m3u'))
      ? path.resolve('./public/portugal.m3u')
      : 'c:/Users/Surface_Dpc/Desktop/PORTUGAL_COMPLETO.m3u';

    if (existsSync(m3uPath)) {
      const fileInfo = await uploadFileToDrive({
        filePath: m3uPath,
        fileName: `PORTUGAL_COMPLETO_${timestamp}.m3u`,
        folderName: 'TelegramBot_IPTV'
      });
      uploaded.push({ name: 'Lista Portugal M3U', link: fileInfo.webViewLink });
    }

    return {
      success: true,
      files: uploaded,
      timestamp
    };
  } catch (err) {
    log.error('Erro no backup para o Google Drive:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}
