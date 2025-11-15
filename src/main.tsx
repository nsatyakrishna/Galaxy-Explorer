/*
  Setup instructions:
  1. Install dependencies with `npm install`.
  2. Start the development server with `npm run dev`.
*/

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
