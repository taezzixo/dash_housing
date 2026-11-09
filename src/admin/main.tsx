import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp.tsx';
import '../styles.css';
import './admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
