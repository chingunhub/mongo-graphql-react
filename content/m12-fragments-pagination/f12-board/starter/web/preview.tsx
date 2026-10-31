// Preview (provided): the whole app on the live reference API, already logged in as Ada.
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { demoLogin } from './dev/demoSession';
import './styles.css';

const token = await demoLogin();
createRoot(document.getElementById('root')!).render(<App uri="/reference/graphql" initialToken={token} />);
