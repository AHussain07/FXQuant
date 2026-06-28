import React from 'react';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-logo">
          <span className="footer-logo-normal">FX</span>
          <span className="footer-logo-primary">Quant</span>
        </div>
        <p className="footer-description">
          Master day trading with AI-powered insights and comprehensive analytics.
        </p>
        <p className="footer-copyright">© {new Date().getFullYear()} All rights reserved.</p>
      </div>
    </footer>
  );
}