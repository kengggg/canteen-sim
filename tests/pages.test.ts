import { selfContainedProblems } from '../scripts/selfcontained';

test('a self-contained page passes; external scripts, styles, images and fetches are named', () => {
  const ok = '<!doctype html><html><head><title>x</title><style>a{}</style><script type="module">console.log(1)</script></head><body><img src="data:image/png;base64,AA"></body></html>';
  expect(selfContainedProblems(ok, 2_000_000)).toEqual([]);
  const bad = '<script src="https://cdn.example/x.js"></script><link rel="stylesheet" href="/assets/a.css"><img src="logo.png"><script>fetch("/data.json")</script>';
  const p = selfContainedProblems(bad, 2_000_000);
  expect(p.join('\n')).toMatch(/script src/);
  expect(p.join('\n')).toMatch(/stylesheet/);
  expect(p.join('\n')).toMatch(/logo\.png/);
  expect(p.join('\n')).toMatch(/fetch/);
});

test('the size budget is enforced', () => {
  expect(selfContainedProblems('<html></html>'.padEnd(2000, ' '), 1000).join(' ')).toMatch(/budget/);
});
