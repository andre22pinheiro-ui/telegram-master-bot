import { isDriveConfigured, backupDatabaseToDrive } from '../src/services/googleDriveService.js';

console.log('--- TESTE GOOGLE DRIVE SERVICE ---');
console.log('Google Drive configurado?', isDriveConfigured());

async function run() {
  const res = await backupDatabaseToDrive();
  console.log('Resultado do backup:', res);
}
run();

