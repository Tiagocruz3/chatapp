/**
 * Theme Management System
 * Handles light/dark mode switching and persistence
 */

export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  SYSTEM: 'system'
};

const THEME_STORAGE_KEY = 'app-theme';
const THEME_COLOR_STORAGE_KEY = 'app-theme-color';

// Theme color options
export const THEME_COLORS = {
  emerald: { primary: '#10b981', hover: '#059669', light: '#d1fae5' },
  blue: { primary: '#3b82f6', hover: '#2563eb', light: '#dbeafe' },
  purple: { primary: '#8b5cf6', hover: '#7c3aed', light: '#ede9fe' },
  rose: { primary: '#f43f5e', hover: '#e11d48', light: '#ffe4e6' },
  orange: { primary: '#f97316', hover: '#ea580c', light: '#ffedd5' },
  cyan: { primary: '#06b6d4', hover: '#0891b2', light: '#cffafe' }
};

/**
 * Get the current theme from storage or default to dark
 */
export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && Object.values(THEMES).includes(saved)) {
      return saved;
    }
  } catch (e) {
    console.error('Error reading theme:', e);
  }
  return THEMES.DARK;
}

/**
 * Save theme preference
 */
export function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.error('Error saving theme:', e);
  }
}

/**
 * Get stored theme color
 */
export function getStoredThemeColor() {
  try {
    const saved = localStorage.getItem(THEME_COLOR_STORAGE_KEY);
    if (saved && THEME_COLORS[saved]) {
      return saved;
    }
  } catch (e) {
    console.error('Error reading theme color:', e);
  }
  return 'emerald';
}

/**
 * Save theme color preference
 */
export function setStoredThemeColor(color) {
  try {
    localStorage.setItem(THEME_COLOR_STORAGE_KEY, color);
  } catch (e) {
    console.error('Error saving theme color:', e);
  }
}

/**
 * Apply theme to document
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  
  if (theme === THEMES.SYSTEM) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? THEMES.DARK : THEMES.LIGHT);
  } else {
    root.setAttribute('data-theme', theme);
  }
}

/**
 * Apply theme color accent
 */
export function applyThemeColor(colorKey) {
  const root = document.documentElement;
  const color = THEME_COLORS[colorKey];
  
  if (color) {
    root.style.setProperty('--accent-color', color.primary);
    root.style.setProperty('--accent-hover', color.hover);
    root.style.setProperty('--accent-light', color.light);
  }
}

/**
 * Initialize theme on app load
 */
export function initializeTheme() {
  const theme = getStoredTheme();
  const color = getStoredThemeColor();
  
  applyTheme(theme);
  applyThemeColor(color);
  
  // Listen for system theme changes if using system preference
  if (theme === THEMES.SYSTEM) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      applyTheme(THEMES.SYSTEM);
    });
  }
}

/**
 * Toggle between light and dark
 */
export function toggleTheme() {
  const current = getStoredTheme();
  const next = current === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;
  setStoredTheme(next);
  applyTheme(next);
  return next;
}

/**
 * Check if current theme is dark
 */
export function isDarkMode() {
  const theme = getStoredTheme();
  if (theme === THEMES.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return theme === THEMES.DARK;
}

/**
 * Get theme label for display
 */
export function getThemeLabel(theme) {
  const labels = {
    [THEMES.DARK]: 'Dark',
    [THEMES.LIGHT]: 'Light',
    [THEMES.SYSTEM]: 'System'
  };
  return labels[theme] || 'Dark';
}

export default {
  THEMES,
  THEME_COLORS,
  getStoredTheme,
  setStoredTheme,
  getStoredThemeColor,
  setStoredThemeColor,
  applyTheme,
  applyThemeColor,
  initializeTheme,
  toggleTheme,
  isDarkMode,
  getThemeLabel
};
