/** Markdown reports retain numbers, code and link destinations verbatim; only reader-facing prose is translated. */
export function documentTemplate(source: string): { key: string; values: string[] } {
  const values: string[] = [];
  const key = source.replace(/`[^`]*`|\]\([^)]+\)|[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g, (value) => {
    const index = values.push(value) - 1;
    return `{v${index}}`;
  });
  return { key, values };
}

export function translateDocument(source: string, translate: (key: string, values: string[]) => string): string {
  const part = (text: string): string => {
    const trimmed = text.trim();
    const { key, values } = documentTemplate(trimmed);
    if (!/[a-z]/i.test(key.replace(/\{v\d+\}/g, ''))) return text;
    const translated = translate(key, values);
    return text.slice(0, text.indexOf(trimmed)) + translated + text.slice(text.indexOf(trimmed) + trimmed.length);
  };
  let inCode = false;
  return source.split('\n').map((line) => {
    if (line.startsWith('```')) { inCode = !inCode; return line; }
    if (inCode) return line;
    return line.trimStart().startsWith('|') ? line.split('|').map(part).join('|') : part(line);
  }).join('\n');
}
