import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PendingUploadProvider } from './stores/pending-upload';
import App from './app';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PendingUploadProvider>
        <App />
      </PendingUploadProvider>
    </BrowserRouter>
  </StrictMode>
);
