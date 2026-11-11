// src/services/pladurService.js — Engenharia de Construção a Seco Pladur-Pro (EN 520 / EN 14195)
export const PLADUR_APP_URL = 'https://pladur-pro.vercel.app';

export const PLADUR_RATIOS_DIVISORIA_DUPLA = {
  placasM2: 2.1, // m² de placa EN 520 por m² parede (dupla face c/ 5% quebra)
  montantesMl: 2.0, // metros lineares EN 14195 (espaçamento 600mm)
  raiasMl: 0.7, // metros lineares de raia inferior/superior
  parafusosUn: 24, // unidades PM 25mm/35mm
  bandaJuntasMl: 1.4, // metros lineares papel microperfurado/fibra
  pastaJuntasKg: 0.8, // kg massa de juntas
  laMineralM2: 1.05 // m² lã mineral 50mm (Rw >= 45dB)
};

export function getPladurSpecifications(areaStr = '') {
  const cleanArea = parseFloat(String(areaStr || '').replace(',', '.'));
  const hasArea = Number.isFinite(cleanArea) && cleanArea > 0;

  let calcBlock = '';
  if (hasArea) {
    const r = PLADUR_RATIOS_DIVISORIA_DUPLA;
    calcBlock =
      `\n📐 *Estimativa Material para ${cleanArea.toFixed(1)} m² (Divisória Dupla Placa 13mm):*\n` +
      `• Placas Gesso Cartonado (EN 520): **${(cleanArea * r.placasM2).toFixed(1)} m²**\n` +
      `• Montantes 48/70mm (EN 14195): **${(cleanArea * r.montantesMl).toFixed(1)} m lineares**\n` +
      `• Raias Horizontais: **${(cleanArea * r.raiasMl).toFixed(1)} m lineares**\n` +
      `• Parafusos PM 25/35mm: **${Math.ceil(cleanArea * r.parafusosUn)} un.**\n` +
      `• Banda de Juntas: **${(cleanArea * r.bandaJuntasMl).toFixed(1)} m lineares**\n` +
      `• Pasta de Juntas: **${(cleanArea * r.pastaJuntasKg).toFixed(1)} kg**\n` +
      `• Lã Mineral 50mm (30-40 kg/m³): **${(cleanArea * r.laMineralM2).toFixed(1)} m²**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  return (
    `🏗️ *ESPECIFICAÇÕES TÉCNICAS NP/EN — PLADUR-PRO*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📐 *1. Normas Estruturais Obrigatórias:*\n` +
    `• *EN 520:* Placas de gesso cartonado (Tipo A standard, Tipo F fogo, Tipo H hidrófuga).\n` +
    `• *EN 14195:* Perfis metálicos em aço galvanizado Z140/Z275 (espessura mínima 0.6mm).\n\n` +
    `🧱 *2. Rácios Base por 1 m² (Divisória Dupla Placa 13mm):*\n` +
    `• Placas (12.5mm/15mm): *2.10 m²* (5% quebra técnica) | Lã Mineral 50mm: *1.05 m²*\n` +
    `• Montantes (a cada 600mm): *2.00 m* | Raias: *0.70 m*\n` +
    `• Parafusos PM 25/35mm: *24 un.* | Banda Juntas: *1.40 m* | Pasta: *0.80 kg*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━` +
    `${calcBlock}\n` +
    `🌐 [Abrir Simulador 3D Pladur-Pro](${PLADUR_APP_URL})\n` +
    `💡 _Calcula para área exata com:_ \`/pladur 25\` _(não inventa preços de loja)._`
  );
}

export default {
  PLADUR_APP_URL,
  PLADUR_RATIOS_DIVISORIA_DUPLA,
  getPladurSpecifications
};

