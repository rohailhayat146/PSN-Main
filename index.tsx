import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Failed to mount application:", error);
  rootElement.innerHTML = `<div style="color: white; padding: 20px; font-family: sans-serif;">
    <h1>Application Error</h1>
    <p>Failed to initialize the application.</p>
    <pre style="color: #f87171; background: #1e293b; padding: 10px; border-radius: 5px; overflow: auto;">${error instanceof Error ? error.message : String(error)}</pre>
  </div>`;
}