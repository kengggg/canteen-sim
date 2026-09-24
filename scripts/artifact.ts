/**
 * npm run build:artifact — dist/artifact.html for the claude.ai artifact page contract: the publisher wraps the file
 * in its own doctype/html/head/body skeleton, so emit the title, styles, app root and scripts without those tags.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const title = /<title>[\s\S]*?<\/title>/.exec(html)?.[0] ?? '<title>Canteen Sim</title>';
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? '';
const bodyWithoutScripts = body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim();
const out = [title, ...styles, bodyWithoutScripts, ...scripts].join('\n');
writeFileSync(new URL('../dist/artifact.html', import.meta.url), out + '\n');
console.log(`dist/artifact.html: ${(out.length / 1024).toFixed(0)} KB, ${styles.length} style block(s), ${scripts.length} script(s)`);
