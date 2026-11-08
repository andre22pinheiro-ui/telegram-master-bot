import { getChannels, searchChannels, getTvCockpit, formatSearchResults } from '../src/services/tvService.js';

console.log('--- TESTE TV SERVICE ---');
const channels = getChannels();
console.log('Total de canais carregados:', channels.length);

const res1 = searchChannels('sport tv 1');
console.log('Resultados "sport tv 1":', res1.map(c => `${c.name} (${c.group})`));

const res2 = searchChannels('panda');
console.log('Resultados "panda":', res2.map(c => `${c.name} (${c.group})`));

const res3 = searchChannels('sic noticias');
console.log('Resultados "sic noticias":', res3.map(c => `${c.name} (${c.group})`));

const menu = getTvCockpit();
console.log('Menu gerado com sucesso. Tamanho:', menu.text.length);

const formatted = formatSearchResults('panda', res2);
console.log('Formatado para Telegram:\n', formatted.text);
