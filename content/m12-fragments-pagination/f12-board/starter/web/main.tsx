// Provided: the real entry point. "Launch my Taskforge" (module 13) builds this file.
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App uri="/mine/graphql" />);
