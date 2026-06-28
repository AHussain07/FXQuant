import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/variables.css';
import './styles/nav.css';
import './styles/footer.css';
import './styles/landing.css';
import './styles/market.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);