import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/src/ui/theme.css';
import { initTheme } from '@/src/ui/theme';
import { App } from './App';

void initTheme();
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
