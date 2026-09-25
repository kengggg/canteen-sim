import { render } from 'preact';
import './ui/theme.css';
import './ui/app.css';
import { App } from './ui/app';
import { installTestHooks, runSelfTest } from './ui/selftest';

const root = document.getElementById('app')!;
if (new URLSearchParams(location.search).get('selftest') === '1') {
  root.innerHTML = '<main style="padding:16px"><h1>Canteen Sim self-test</h1><p id="selftest-status">starting</p></main>';
  void runSelfTest((s) => { document.getElementById('selftest-status')!.textContent = s; });
} else {
  installTestHooks();
  render(<App />, root);
}
