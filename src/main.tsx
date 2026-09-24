import { render } from 'preact';
import './ui/theme.css';

function App() {
  return <main style={{ padding: '16px' }}>Canteen Sim</main>;
}

render(<App />, document.getElementById('app')!);
