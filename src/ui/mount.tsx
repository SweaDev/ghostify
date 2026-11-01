import { type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { initTheme } from './theme';

/** Shared bootstrap for extension pages: theme + React root. */
export function mount(node: ReactNode): void {
  void initTheme();
  const root = document.getElementById('root');
  if (root) createRoot(root).render(<StrictMode>{node}</StrictMode>);
}
