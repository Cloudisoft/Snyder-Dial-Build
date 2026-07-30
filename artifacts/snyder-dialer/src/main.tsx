import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Initialize dark mode — Snyder Dialer is dark-first
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<App />);
