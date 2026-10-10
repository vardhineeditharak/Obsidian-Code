import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';
import './lib/monacoSetup';

// Mount single Toaster at the root with dark theme and richColors as instructed by ask-sonner
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster
      theme="dark"
      richColors
      position="bottom-right"
      toastOptions={{
        className: 'border border-white/10 bg-slate-900/90 backdrop-blur-md text-slate-100 text-sm shadow-xl',
      }}
    />
  </React.StrictMode>
);
