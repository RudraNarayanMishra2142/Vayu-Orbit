/**
 * VAYU ORBIT — User Workspace Preferences Service
 * Versioned, account-scoped browser storage for non-sensitive workspace preferences.
 * 
 * Strict safety rules:
 * 1. Storage is strictly scoped to authenticated user ID or email.
 * 2. If neither ID nor email exists, uses in-memory defaults (no shared fallback persistence).
 * 3. Never stores credentials, tokens, passwords, or secrets.
 * 4. Recovers gracefully from malformed data, version mismatches, or storage errors.
 */

export const PREFERENCES_SCHEMA_VERSION = 1;
const STORAGE_PREFIX = 'vayu_user_prefs_v1';
const PREFERENCES_EVENT = 'vayu_preferences_updated';

export const CLOCK_FORMATS = Object.freeze({
  H24: '24h',
  H12: '12h'
});

export const DATE_FORMATS = Object.freeze({
  DD_MMM_YYYY: 'DD-MMM-YYYY',
  YYYY_MM_DD: 'YYYY-MM-DD',
  DD_MM_YYYY: 'DD/MM/YYYY'
});

export const MAP_VIEWS = Object.freeze({
  TACTICAL: 'tactical',
  OVERVIEW: 'overview'
});

export const SIDEBAR_STATES = Object.freeze({
  EXPANDED: 'expanded',
  COLLAPSED: 'collapsed'
});

export const THEMES = Object.freeze({
  DARK: 'dark',
  LIGHT: 'light'
});

export const DEFAULT_PREFERENCES = Object.freeze({
  version: PREFERENCES_SCHEMA_VERSION,
  clockFormat: CLOCK_FORMATS.H24,
  dateFormat: DATE_FORMATS.DD_MMM_YYYY,
  sidebarState: SIDEBAR_STATES.EXPANDED,
  theme: THEMES.DARK,
  mapView: MAP_VIEWS.TACTICAL
});

// In-memory fallback cache when browser storage is unavailable or user has no ID/email
const inMemoryCache = new Map();

/**
 * Derives a strictly scoped storage key for the given authenticated user.
 * Returns null if no valid user identifier exists (preventing shared leakage).
 */
export function getStorageKey(user) {
  if (!user || typeof user !== 'object') return null;
  if (user.id && typeof user.id === 'string' && user.id.trim()) {
    const safeId = user.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${STORAGE_PREFIX}_id_${safeId}`;
  }
  if (user.email && typeof user.email === 'string' && user.email.trim()) {
    const safeEmail = user.email.trim().toLowerCase().replace(/[^a-zA-Z0-9_@.-]/g, '_');
    return `${STORAGE_PREFIX}_email_${safeEmail}`;
  }
  return null;
}

/**
 * Validates and normalizes raw preference values against supported schema.
 */
export function normalizePreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_PREFERENCES };
  }

  // Check version compatibility
  if (raw.version !== PREFERENCES_SCHEMA_VERSION) {
    // Unsupported or future schema version -> recover to safe defaults
    return { ...DEFAULT_PREFERENCES };
  }

  const clockFormat = raw.clockFormat === CLOCK_FORMATS.H12
    ? CLOCK_FORMATS.H12
    : CLOCK_FORMATS.H24;

  const dateFormat = Object.values(DATE_FORMATS).includes(raw.dateFormat)
    ? raw.dateFormat
    : DATE_FORMATS.DD_MMM_YYYY;

  const sidebarState = raw.sidebarState === SIDEBAR_STATES.COLLAPSED
    ? SIDEBAR_STATES.COLLAPSED
    : SIDEBAR_STATES.EXPANDED;

  const theme = raw.theme === THEMES.LIGHT
    ? THEMES.LIGHT
    : THEMES.DARK;

  const mapView = Object.values(MAP_VIEWS).includes(raw.mapView)
    ? raw.mapView
    : MAP_VIEWS.TACTICAL;

  return {
    version: PREFERENCES_SCHEMA_VERSION,
    clockFormat,
    dateFormat,
    sidebarState,
    theme,
    mapView
  };
}

/**
 * Retrieves preferences for the authenticated user.
 * Recovers safely from corrupt data or storage failures.
 */
export function getPreferences(user) {
  const key = getStorageKey(user);
  if (!key) {
    // Unauthenticated or unidentifiable user -> return in-memory default
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        const normalized = normalizePreferences(parsed);
        inMemoryCache.set(key, normalized);
        return normalized;
      }
    }
  } catch (err) {
    console.warn(`[VAYU ORBIT] Failed to read preferences from localStorage (${key}):`, err);
  }

  // Check in-memory fallback
  if (inMemoryCache.has(key)) {
    return { ...inMemoryCache.get(key) };
  }

  return { ...DEFAULT_PREFERENCES };
}

/**
 * Applies a theme ('light' or 'dark') to documentElement and saves it to global storage.
 * Dispatches 'vayu_theme_changed' custom event so maps, charts, and shell instantly react.
 */
export function applyThemeToDocument(theme) {
  const validTheme = theme === THEMES.LIGHT ? THEMES.LIGHT : THEMES.DARK;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', validTheme);
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('vayu_theme', validTheme);
    } catch {}
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('vayu_theme_changed', { detail: { theme: validTheme } }));
    } catch {}
  }
  return validTheme;
}

/**
 * Returns the effective theme for the current context.
 */
export function getEffectiveTheme(user) {
  const prefs = getPreferences(user);
  if (prefs && prefs.theme) {
    return prefs.theme;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem('vayu_theme');
      if (stored === THEMES.LIGHT || stored === THEMES.DARK) return stored;
    } catch {}
  }
  return THEMES.DARK;
}

/**
 * Convenience method to update theme across both user preferences and immediate DOM.
 */
export function setTheme(user, theme) {
  const validTheme = theme === THEMES.LIGHT ? THEMES.LIGHT : THEMES.DARK;
  applyThemeToDocument(validTheme);
  return savePreferences(user, { theme: validTheme });
}

/**
 * Saves preferences for the authenticated user.
 * Dispatches an update event so listeners (e.g. Layout) update immediately.
 * Returns an object indicating success status and error message if any.
 */
export function savePreferences(user, updates) {
  const key = getStorageKey(user);
  const current = getPreferences(user);
  const candidate = normalizePreferences({
    ...current,
    ...updates,
    version: PREFERENCES_SCHEMA_VERSION
  });

  // Always enforce theme changes onto the document and global fallback storage
  if (candidate.theme) {
    applyThemeToDocument(candidate.theme);
  }

  if (!key) {
    return {
      success: true,
      appliedLocally: true,
      error: null,
      preferences: candidate
    };
  }

  let storageSucceeded = false;
  let storageError = null;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(candidate));
      storageSucceeded = true;
    }
  } catch (err) {
    storageError = err.message || 'Browser localStorage write failed.';
    console.warn(`[VAYU ORBIT] Failed to write preferences to localStorage (${key}):`, err);
  }

  // Update in-memory cache regardless
  inMemoryCache.set(key, candidate);

  // Notify listeners across application
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT, {
        detail: {
          key,
          preferences: candidate,
          userEmail: user?.email || null,
          userId: user?.id || null
        }
      }));
    } catch {}
  }

  if (storageSucceeded) {
    return { success: true, preferences: candidate };
  } else {
    return {
      success: false,
      error: storageError || 'Preferences applied in memory only (storage unavailable).',
      preferences: candidate
    };
  }
}

/**
 * Resets preferences to default values for the authenticated user.
 */
export function resetPreferences(user) {
  const key = getStorageKey(user);
  const defaults = { ...DEFAULT_PREFERENCES };

  applyThemeToDocument(THEMES.DARK);

  if (key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (err) {
      console.warn(`[VAYU ORBIT] Failed to remove preferences from localStorage (${key}):`, err);
    }
    inMemoryCache.delete(key);
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT, {
        detail: {
          key,
          preferences: defaults,
          userEmail: user?.email || null,
          userId: user?.id || null,
          isReset: true
        }
      }));
    } catch {}
  }

  return { success: true, preferences: defaults };
}

/**
 * Subscribes to preference changes across the application.
 * Returns an unsubscribe callback.
 */
export function subscribePreferences(callback) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (event) => {
    if (event?.detail?.preferences) {
      callback(event.detail.preferences, event.detail);
    }
  };
  window.addEventListener(PREFERENCES_EVENT, handler);
  return () => {
    window.removeEventListener(PREFERENCES_EVENT, handler);
  };
}
