import { render } from 'preact';
import './ui/theme.css';
import './ui/app.css';
import { App } from './ui/app';

render(<App />, document.getElementById('app')!);
