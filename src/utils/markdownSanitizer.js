// src/utils/markdownSanitizer.js — Sanitizador Resiliente de Markdown para o Telegram
/**
 * Garante que mensagens formatadas para o Telegram em Markdown Legacy
 * nunca falham com o erro 400 "can't parse entities".
 */
export function sanitizeTelegramMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  // 1. Proteger blocos de código com tokens temporários sem underscores
  const codeBlocks = [];
  let processed = text.replace(/```([\s\S]*?)```/g, (match) => {
    codeBlocks.push(match);
    return `§§CODEBLOCK${codeBlocks.length - 1}§§`;
  });

  // 2. Proteger código inline
  const inlineCodes = [];
  processed = processed.replace(/`([^`\n]+)`/g, (match) => {
    inlineCodes.push(match);
    return `§§INLINECODE${inlineCodes.length - 1}§§`;
  });

  // 3. Proteger links markdown [texto](url)
  const links = [];
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, title, url) => {
    // Sanitizar o interior do URL se tiver underscores
    const safeUrl = url.replace(/_/g, '%5F');
    links.push(`[${title}](${safeUrl})`);
    return `§§MDLINK${links.length - 1}§§`;
  });

  // 4. Escapar underscores isolados dentro de palavras (snake_case ex: area_util, preco_max)
  // que causam 99% dos erros 400 do Telegram
  processed = processed.replace(/([a-zA-Z0-9])_([a-zA-Z0-9])/g, '$1\\_$2');

  // 5. Verificar balanceamento de asteriscos (*)
  // Se o número de asteriscos for ímpar, escapar o último asterisco solto
  const asteriskCount = (processed.match(/\*/g) || []).length;
  if (asteriskCount % 2 !== 0) {
    const lastIdx = processed.lastIndexOf('*');
    processed = processed.substring(0, lastIdx) + '\\*' + processed.substring(lastIdx + 1);
  }

  // 6. Verificar balanceamento de underscores (_)
  const underscoreMatches = processed.match(/(?<!\\)_/g) || [];
  if (underscoreMatches.length % 2 !== 0) {
    const lastIdx = processed.lastIndexOf('_');
    processed = processed.substring(0, lastIdx) + '\\_' + processed.substring(lastIdx + 1);
  }

  // 7. Restaurar links
  processed = processed.replace(/§§MDLINK(\d+)§§/g, (_, idx) => links[parseInt(idx, 10)] || '');

  // 8. Restaurar código inline
  processed = processed.replace(/§§INLINECODE(\d+)§§/g, (_, idx) => inlineCodes[parseInt(idx, 10)] || '');

  // 9. Restaurar blocos de código
  processed = processed.replace(/§§CODEBLOCK(\d+)§§/g, (_, idx) => codeBlocks[parseInt(idx, 10)] || '');

  return processed;
}

export default { sanitizeTelegramMarkdown };
