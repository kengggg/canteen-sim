/**
 * Checks that a built page needs nothing but itself (spec §14: one file, no external requests), so it can be hosted
 * anywhere static — GitHub Pages, a file share, or opened from disk. Returns human-readable problems; empty = fine.
 */
export function selfContainedProblems(html: string, budgetBytes: number): string[] {
  const problems: string[] = [];
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > budgetBytes) problems.push(`page is ${(bytes / 1024).toFixed(0)} KB, over the ${(budgetBytes / 1024).toFixed(0)} KB budget`);
  // Markup outside inline scripts and styles.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.slice(0, m.indexOf('>') + 1)).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style>');
  for (const m of markup.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) problems.push(`external script src=${m[1]}`);
  for (const m of markup.matchAll(/<link\b[^>]*>/gi)) {
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(m[0])?.[1];
    if (href && !/^(data|blob):/i.test(href)) problems.push(`${/stylesheet/i.test(m[0]) ? 'external stylesheet' : 'linked resource'} ${href}`);
  }
  for (const m of markup.matchAll(/<(img|source|video|audio|iframe|embed|object)\b[^>]*\b(?:src|data|poster)\s*=\s*["']?([^"'\s>]+)/gi)) {
    if (!/^(data|blob):/i.test(m[2])) problems.push(`external ${m[1]} ${m[2]}`);
  }
  // Network calls from the code.
  for (const api of ['fetch(', 'importScripts(', 'XMLHttpRequest', 'new EventSource', 'new WebSocket', 'sendBeacon(']) {
    if (html.includes(api)) problems.push(`code calls ${api.replace('(', '')}`);
  }
  return problems;
}
