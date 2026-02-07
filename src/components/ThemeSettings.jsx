import { useState, useEffect } from 'react';
import { 
  THEMES, 
  THEME_COLORS, 
  getStoredTheme, 
  setStoredTheme,
  getStoredThemeColor,
  setStoredThemeColor,
  applyTheme,
  applyThemeColor,
  getThemeLabel
} from '../lib/theme';
import './ThemeSettings.css';

export default function ThemeSettings({ showToast }) {
  const [currentTheme, setCurrentTheme] = useState(() => getStoredTheme());
  const [currentColor, setCurrentColor] = useState(() => getStoredThemeColor());

  const handleThemeChange = (theme) => {
    setStoredTheme(theme);
    applyTheme(theme);
    setCurrentTheme(theme);
    showToast?.(`Theme set to ${getThemeLabel(theme)}`);
  };

  const handleColorChange = (colorKey) => {
    setStoredThemeColor(colorKey);
    applyThemeColor(colorKey);
    setCurrentColor(colorKey);
    showToast?.('Accent color updated');
  };

  return (
    <div className="theme-settings">
      <div className="settings-page-section">
        <h2 className="settings-section-title">Appearance</h2>
        <p className="settings-section-description">
          Customise the look and feel of your chat interface
        </p>

        {/* Theme Mode Selection */}
        <div className="theme-mode-section">
          <h3 className="theme-subsection-title">Theme Mode</h3>
          <div className="theme-mode-options">
            <button
              className={`theme-mode-card ${currentTheme === THEMES.LIGHT ? 'active' : ''}`}
              onClick={() => handleThemeChange(THEMES.LIGHT)}
            >
              <div className="theme-mode-preview light">
                <div className="preview-sidebar"></div>
                <div className="preview-main">
                  <div className="preview-message user"></div>
                  <div className="preview-message assistant"></div>
                </div>
              </div>
              <div className="theme-mode-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                Light
              </div>
            </button>

            <button
              className={`theme-mode-card ${currentTheme === THEMES.DARK ? 'active' : ''}`}
              onClick={() => handleThemeChange(THEMES.DARK)}
            >
              <div className="theme-mode-preview dark">
                <div className="preview-sidebar"></div>
                <div className="preview-main">
                  <div className="preview-message user"></div>
                  <div className="preview-message assistant"></div>
                </div>
              </div>
              <div className="theme-mode-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                Dark
              </div>
            </button>

            <button
              className={`theme-mode-card ${currentTheme === THEMES.SYSTEM ? 'active' : ''}`}
              onClick={() => handleThemeChange(THEMES.SYSTEM)}
            >
              <div className="theme-mode-preview system">
                <div className="preview-sidebar half-dark"></div>
                <div className="preview-main half-light">
                  <div className="preview-message user"></div>
                  <div className="preview-message assistant"></div>
                </div>
              </div>
              <div className="theme-mode-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                System
              </div>
            </button>
          </div>
        </div>

        {/* Accent Color Selection */}
        <div className="theme-color-section">
          <h3 className="theme-subsection-title">Accent Colour</h3>
          <div className="theme-color-options">
            {Object.entries(THEME_COLORS).map(([key, color]) => (
              <button
                key={key}
                className={`theme-color-btn ${currentColor === key ? 'active' : ''}`}
                onClick={() => handleColorChange(key)}
                style={{ 
                  '--color-primary': color.primary,
                  '--color-hover': color.hover
                }}
                title={`${key.charAt(0).toUpperCase() + key.slice(1)} theme`}
              >
                <span 
                  className="color-dot" 
                  style={{ background: color.primary }}
                />
                {currentColor === key && (
                  <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
          <p className="theme-color-hint">
            Choose your preferred accent colour for buttons, links, and highlights
          </p>
        </div>

        {/* Current Settings Summary */}
        <div className="theme-current-settings">
          <div className="theme-summary-item">
            <span className="summary-label">Current Theme:</span>
            <span className="summary-value">{getThemeLabel(currentTheme)}</span>
          </div>
          <div className="theme-summary-item">
            <span className="summary-label">Accent Colour:</span>
            <span 
              className="summary-color-dot" 
              style={{ background: THEME_COLORS[currentColor]?.primary }}
            />
            <span className="summary-value capitalize">{currentColor}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
