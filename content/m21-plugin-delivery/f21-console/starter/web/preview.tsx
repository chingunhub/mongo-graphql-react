import { createRoot } from 'react-dom/client';
import { OperationsPanel, type OperationsApi } from './OperationsPanel';
let pending = 2;
const api: OperationsApi = {
  report: async () => ({ tickets: 2, pending, activities: 2 - pending }),
  dispatch: async (fail) => {
    if (fail) return { delivered: 0, failed: pending };
    const delivered = pending;
    pending = 0;
    return { delivered, failed: 0 };
  },
};
createRoot(document.getElementById('root')!).render(<OperationsPanel api={api} />);
