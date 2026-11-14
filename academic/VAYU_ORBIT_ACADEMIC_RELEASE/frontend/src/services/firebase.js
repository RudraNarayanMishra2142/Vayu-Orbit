import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider, getToken } from 'firebase/app-check';

/**
 * Validates whether all mandatory Firebase Web environment variables are defined.
 */
export function validateFirebaseConfig(env = import.meta.env) {
  const missing = [];
  if (!env.VITE_FIREBASE_API_KEY) missing.push('VITE_FIREBASE_API_KEY');
  if (!env.VITE_FIREBASE_AUTH_DOMAIN) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!env.VITE_FIREBASE_PROJECT_ID) missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!env.VITE_FIREBASE_APP_ID) missing.push('VITE_FIREBASE_APP_ID');
  return missing;
}

const missingConfig = validateFirebaseConfig();

// Strict configuration reading exclusively from Vite environment variables
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
};

// Fail clearly and safely if configuration is absent
export const isFirebaseConfigured = missingConfig.length === 0;

if (!isFirebaseConfigured && typeof window !== 'undefined') {
  const message = `[VAYU ORBIT SECURITY] Firebase Web App configuration is incomplete. Missing: ${missingConfig.join(', ')}. ` +
                  `Authentication and App Check require these variables to be configured in your environment (.env.local / .env.production).`;
  if (import.meta.env.PROD) {
    console.error(message);
  } else {
    console.warn(message);
  }
}

// Initialize Firebase Core App safely as singleton
function createFirebaseApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  // If configuration is missing, use safe descriptor placeholders to allow build tools and static analysis to succeed
  return initializeApp({
    apiKey: firebaseConfig.apiKey || 'UNCONFIGURED_FIREBASE_API_KEY',
    authDomain: firebaseConfig.authDomain || 'unconfigured.firebaseapp.com',
    projectId: firebaseConfig.projectId || 'unconfigured-project',
    storageBucket: firebaseConfig.storageBucket || '',
    messagingSenderId: firebaseConfig.messagingSenderId || '',
    appId: firebaseConfig.appId || '1:000000000000:web:0000000000000000000000',
    measurementId: firebaseConfig.measurementId || ''
  });
}

export const firebaseApp = createFirebaseApp();

let appCheckInstance = null;

// Initialize Firebase App Check if in browser environment
export const initAppCheck = () => {
  if (typeof window === 'undefined' || appCheckInstance) {
    return appCheckInstance;
  }

  const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
  const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;

  // In development mode or when debug token configured, enable App Check debug provider
  if (isDev || debugToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
  }

  const recaptchaKey = import.meta.env.VITE_FIREBASE_RECAPTCHA_KEY;

  try {
    if (recaptchaKey) {
      appCheckInstance = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(recaptchaKey),
        isTokenAutoRefreshEnabled: true
      });
    } else if (isDev || debugToken) {
      // In development without reCAPTCHA key, initialize debug/custom provider
      appCheckInstance = initializeAppCheck(firebaseApp, {
        provider: new CustomProvider({
          getToken: () => Promise.resolve({
            token: typeof self.FIREBASE_APPCHECK_DEBUG_TOKEN === 'string'
              ? self.FIREBASE_APPCHECK_DEBUG_TOKEN
              : 'vayu-orbit-dev-debug-token',
            expireTimeMillis: Date.now() + 3600000
          })
        }),
        isTokenAutoRefreshEnabled: true
      });
    }
  } catch (err) {
    console.warn('Firebase App Check initialization deferred:', err.message);
  }

  return appCheckInstance;
};

// Safe helper to acquire current App Check token
export const getAppCheckToken = async (forceRefresh = false) => {
  try {
    const appCheck = initAppCheck();
    if (!appCheck) {
      return null;
    }
    const tokenResult = await getToken(appCheck, forceRefresh);
    return tokenResult?.token || null;
  } catch (err) {
    // Non-blocking in monitoring mode; protected endpoints will enforce based on backend policy
    console.warn('App Check token retrieval warning:', err.message);
    return null;
  }
};
