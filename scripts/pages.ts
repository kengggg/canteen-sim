/**
 * npm run build:pages — dist/ ready for GitHub Pages (or any static host): the single-file index.html, checked to be
 * self-contained and within the 1.5 MB budget, plus .nojekyll so Pages serves it untouched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { selfContainedProblems } from './selfcontained';

const BUDGET = 1.5 * 1024 * 1024;
const file = new URL('../dist/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const problems = selfContainedProblems(html, BUDGET);
if (problems.length > 0) {
  console.error(`dist/index.html is not a self-contained page:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync(new URL('../dist/.nojekyll', import.meta.url), '');
console.log(`dist/ is ready for GitHub Pages: index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, self-contained) and .nojekyll`);
