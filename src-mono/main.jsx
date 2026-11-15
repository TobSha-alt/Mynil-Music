import React from 'react';
import ReactDOM from 'react-dom/client';
import './api';
import App from './App';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('contextmenu', (e) => {
    const tag = e.target?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.target?.isContentEditable) {
      e.preventDefault();
    }
  });
  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if (
      e.key === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
      ((e.ctrlKey || e.metaKey) && k === 'u')
    ) {
      e.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
