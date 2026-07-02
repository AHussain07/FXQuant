import ReactDOM from 'react-dom/client';
import './styles/variables.css';
import './styles/nav.css';
import './styles/footer.css';
import './styles/landing.css';
import './styles/market.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';

// NOTE: React.StrictMode is intentionally omitted. Its dev-only double-mounting
// tears down and re-creates the Firebase auth instance mid-popup-flow, which
// triggers the SDK's "INTERNAL ASSERTION FAILED: Pending promise was never set"
// error during signInWithPopup. StrictMode has no effect on production builds,
// so removing it changes only the dev experience.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
);