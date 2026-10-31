import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { installUnloadGuard } from './unloadGuard';

installUnloadGuard();

createRoot(document.getElementById('root')!).render(<App />);
