import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept and swallow benign HMR / WebSocket connection rejection warnings in development iframe environment
window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = event.reason ? String(event.reason.message || event.reason) : '';
  if (
    reasonStr.includes('WebSocket') || 
    reasonStr.includes('websocket') || 
    reasonStr.includes('WS') ||
    reasonStr.includes('opened')
  ) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  const errorMsg = event.message || '';
  if (
    errorMsg.includes('WebSocket') || 
    errorMsg.includes('websocket') ||
    errorMsg.includes('opened')
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
