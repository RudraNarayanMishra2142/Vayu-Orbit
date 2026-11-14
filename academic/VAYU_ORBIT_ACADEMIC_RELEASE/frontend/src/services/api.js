import { getAppCheckToken } from './firebase';
import { getFirebaseIdToken, loginWithFirebase, logoutFromFirebase } from './firebaseAuth';

let apiConfigError = null;

const getApiBase = () => {
  const envBase = (
    import.meta.env.VITE_API_BASE ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ''
  ).trim().replace(/\/+$/, '');

  if (envBase) {
    return envBase;
  }

  // Preserve development localhost behaviour
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return `http://${host}:8000`;
    }
  } else if (!import.meta.env.PROD) {
    return 'http://127.0.0.1:8000';
  }

  // In production, missing API configuration must NOT silently fall back to window.location.origin
  apiConfigError = 'Production API configuration missing: VITE_API_BASE is not configured. Set VITE_API_BASE in your environment to point to your backend service (e.g. https://your-backend.onrender.com).';
  return '';
};

const BASE = getApiBase();

const TOKEN_KEY = 'vayu_auth_token';

export function getAuthToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

function parseErrorDetail(d, status) {
  if (typeof d?.detail === 'string') return d.detail;
  if (typeof d?.detail === 'object' && d?.detail?.message) return d.detail.message;
  if (Array.isArray(d?.detail)) return d.detail.map(e => (e.loc && e.loc.length > 1 ? e.loc.slice(1).join('.') + ': ' : e.loc && e.loc.length === 1 ? e.loc[0] + ': ' : '') + e.msg).join('; ');
  if (d?.message) return d.message;
  return `Request failed (${status})`;
}

async function req(path, opts = {}) {
  if (apiConfigError) {
    throw new Error(apiConfigError);
  }
  let token = null;
  try {
    token = await getFirebaseIdToken();
  } catch {}
  if (!token) {
    token = getAuthToken();
  }

  let appCheckToken = null;
  try {
    appCheckToken = await getAppCheckToken();
  } catch {}

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
    ...(opts.headers || {})
  };
  let r;
  try {
    r = await fetch(BASE + path, {
      credentials: 'include',
      headers,
      ...opts
    });
  } catch (netErr) {
    throw new Error(`Unable to connect to backend server at ${BASE}. Ensure the backend service is running.`);
  }
  let d = null;
  try {
    d = await r.json();
  } catch {}

  // If request failed specifically due to an expired App Check token, retry once with forceRefresh
  if (r.status === 401 && typeof d?.detail === 'string' && d.detail.includes('App Check') && !opts._retriedAppCheck) {
    try {
      const refreshedToken = await getAppCheckToken(true);
      return await req(path, {
        ...opts,
        _retriedAppCheck: true,
        headers: {
          ...(opts.headers || {}),
          ...(refreshedToken ? { 'X-Firebase-AppCheck': refreshedToken } : {})
        }
      });
    } catch {}
  }

  // If request failed with 401 on an authenticated endpoint, try refreshing Firebase ID token once
  if (r.status === 401 && !opts._retriedAuth && path !== '/api/auth/login' && path !== '/api/auth/session') {
    try {
      const refreshedAuthToken = await getFirebaseIdToken(true);
      if (refreshedAuthToken) {
        setAuthToken(refreshedAuthToken);
        return await req(path, {
          ...opts,
          _retriedAuth: true,
          headers: {
            ...(opts.headers || {}),
            Authorization: `Bearer ${refreshedAuthToken}`
          }
        });
      }
    } catch {}
  }

  if (r.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/session' && !(typeof d?.detail === 'string' && d.detail.includes('App Check'))) {
    setAuthToken(null);
    if (typeof unauthorizedHandler === 'function') {
      try {
        unauthorizedHandler();
      } catch (err) {
        console.warn('Unauthorized handler error:', err);
      }
    }
  }
  if (!r.ok) {
    const err = new Error(parseErrorDetail(d, r.status));
    err.status = r.status;
    err.detail = d?.detail;
    err.data = d;
    throw err;
  }
  return d;
}

export const api = {
  base: BASE || (apiConfigError ? 'UNCONFIGURED_PRODUCTION_API' : 'http://127.0.0.1:8000'),
  configError: apiConfigError,
  // Firebase Authentication
  login: async (email, password) => {
    let idToken = null;
    try {
      const fbAuthResult = await loginWithFirebase(email, password);
      idToken = fbAuthResult.idToken;
    } catch (fbErr) {
      console.warn('Firebase client login attempt:', fbErr.message);
      // If error is invalid credentials or disabled, rethrow to show accurate user feedback
      if (fbErr.code && fbErr.code !== 'auth/network-request-failed') {
        throw fbErr;
      }
    }

    if (idToken) {
      const sessionRes = await req('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ id_token: idToken })
      });
      if (sessionRes?.token) {
        setAuthToken(sessionRes.token);
      }
      return sessionRes;
    }

    // Direct / Transition Fallback
    const res = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res?.token) {
      setAuthToken(res.token);
    }
    return res;
  },
  logout: async () => {
    try {
      await logoutFromFirebase();
    } catch {}
    try {
      await req('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },
  getMe: () => req('/api/auth/me'),
  listUsers: () => req('/api/auth/users'),
  updateUserRole: (userId, role) => req(`/api/auth/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  updateUserStatus: (userId, status) => req(`/api/auth/users/${userId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  // Existing Endpoints
  health: () => req('/api/health'),
  nodes: () => req('/api/nodes'),
  vehicles: () => req('/api/vehicles'),
  addVehicle: v => req('/api/vehicles', { method: 'POST', body: JSON.stringify(v) }),
  vehicleStatus: (id, status) => req(`/api/vehicles/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  fleetUnits: (q = '') => req('/api/fleet-units' + q),
  addFleetUnit: fu => req('/api/fleet-units', { method: 'POST', body: JSON.stringify(fu) }),
  fleetUnitStatus: (id, status) => req(`/api/fleet-units/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  places: (q = '') => req('/api/places' + q),
  addPlace: p => req('/api/places', { method: 'POST', body: JSON.stringify(p) }),
  placeStatus: (id, status) => req(`/api/places/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  route: r => req('/api/route', { method: 'POST', body: JSON.stringify(r) }),
  // VORAM v0.1 Risk Assessment Model Endpoints
  voramConfig: () => req('/api/voram/config'),
  voramAssess: payload => req('/api/voram/assess', { method: 'POST', body: JSON.stringify(payload) }),
  voramAssessRoute: payload => req('/api/voram/assess-route', { method: 'POST', body: JSON.stringify(payload) }),
  sitrep: s => req('/api/intelligence/sitrep', { method: 'POST', body: JSON.stringify({ sitrep: s }) }),
  recalc: r => req('/api/route/recalculate', { method: 'POST', body: JSON.stringify(r) }),
  whatif: r => req('/api/simulation/what-if', { method: 'POST', body: JSON.stringify(r) }),
  journeys: () => req('/api/journeys'),
  journey: id => req(`/api/journeys/${id}`),
  journeyReport: id => req(`/api/journeys/${id}/report`),
  downloadJourneyReportPdf: async (journeyId) => {
    if (apiConfigError) {
      throw new Error(apiConfigError);
    }
    const token = getAuthToken();
    let appCheckToken = null;
    try {
      appCheckToken = await getAppCheckToken();
    } catch {}

    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {})
    };
    const r = await fetch(`${BASE}/api/journeys/${journeyId}/report/pdf`, {
      credentials: 'include',
      headers
    });
    if (r.status === 401) {
      setAuthToken(null);
      if (typeof unauthorizedHandler === 'function') {
        try {
          unauthorizedHandler();
        } catch (err) {
          console.warn('Unauthorized handler error:', err);
        }
      }
    }
    if (!r.ok) {
      let d = null;
      try {
        d = await r.json();
      } catch {}
      const err = new Error(parseErrorDetail(d, r.status));
      err.status = r.status;
      err.detail = d?.detail;
      err.data = d;
      throw err;
    }
    const blob = await r.blob();
    const disposition = r.headers.get('content-disposition') || '';
    let filename = `VAYU-ORBIT-Journey-Debrief-${journeyId}.pdf`;
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if (match && match[1]) {
      filename = match[1];
    }
    return { blob, filename };
  },
  createJourney: j => req('/api/journeys', { method: 'POST', body: JSON.stringify(j) }),
  journeyStatus: (id, status, message = '', override_reason = null) => req(`/api/journeys/${id}/status`, { method: 'POST', body: JSON.stringify({ status, message, override_reason }) }),
  fuelOverride: (id, data) => req(`/api/journeys/${id}/fuel-override`, { method: 'POST', body: JSON.stringify(data) }),
  deleteFuelOverride: id => req(`/api/journeys/${id}/fuel-override`, { method: 'DELETE' }),
  disruption: (id, data) => req(`/api/journeys/${id}/disruption`, { method: 'POST', body: JSON.stringify(data) }),
  event: (id, e) => req(`/api/journeys/${id}/events`, { method: 'POST', body: JSON.stringify(e) }),
  spacingConfig: id => req(`/api/journeys/${id}/spacing-config`),
  setSpacingConfig: (id, cfg) => req(`/api/journeys/${id}/spacing-config`, { method: 'POST', body: JSON.stringify(cfg) }),
  incidents: id => req(`/api/journeys/${id}/incidents`),
  createIncident: (id, inc) => req(`/api/journeys/${id}/incidents`, { method: 'POST', body: JSON.stringify(inc) }),
  ackIncident: (id, incId, reqBody = {}) => req(`/api/journeys/${id}/incidents/${incId}/ack`, { method: 'POST', body: JSON.stringify(reqBody) }),
  resolveIncident: (id, incId, res) => req(`/api/journeys/${id}/incidents/${incId}/resolve`, { method: 'POST', body: JSON.stringify(res) }),
  fuelIntelligence: id => req(`/api/journeys/${id}/fuel-intelligence`),
  setFuelConfig: (id, cfg) => req(`/api/journeys/${id}/fuel-config`, { method: 'POST', body: JSON.stringify(cfg) }),
  previewFuelDetour: (id, stationId) => req(`/api/journeys/${id}/fuel-preview-detour`, { method: 'POST', body: JSON.stringify({ station_id: stationId }) }),
  applyFuelDetour: (id, stationId) => req(`/api/journeys/${id}/fuel-apply-detour`, { method: 'POST', body: JSON.stringify({ station_id: stationId }) }),
  // ROP Evidence, VORAM Reassessment & Sensitivity Advisory
  createStagedSession: () => req('/api/staged-sessions', { method: 'POST' }),
  ropReport: (journeyId, routeVersion = '') => req(`/api/rop-reports/${journeyId}${routeVersion ? `?route_version=${encodeURIComponent(routeVersion)}` : ''}`),
  submitRopReport: (journeyId, data) => req(`/api/rop-reports/${journeyId}`, { method: 'POST', body: JSON.stringify(data) }),
  reviewRopReport: (journeyId, reportId, data) => req(`/api/rop-reports/${journeyId}/${reportId}/review`, { method: 'POST', body: JSON.stringify(data) }),
  reassessVoram: (journeyId) => req(`/api/journeys/${journeyId}/reassess-voram`, { method: 'POST' }),
  stagedReassessVoram: (payload) => req('/api/staged-reassess-voram', { method: 'POST', body: JSON.stringify(payload) }),
  sensitivityAdvisory: (journeyId) => req(`/api/sensitivity-advisory/${journeyId}`),
  updateSensitivityAdvisory: (journeyId, data) => req(`/api/sensitivity-advisory/${journeyId}`, { method: 'POST', body: JSON.stringify(data) }),
  journeyReadiness: (journeyId) => req(`/api/journeys/${journeyId}/readiness`),
  readinessOverride: (journeyId, data) => req(`/api/journeys/${journeyId}/readiness-override`, { method: 'POST', body: JSON.stringify(data) }),
  analytics: () => req('/api/analytics'),
  audit: () => req('/api/audit')
};
