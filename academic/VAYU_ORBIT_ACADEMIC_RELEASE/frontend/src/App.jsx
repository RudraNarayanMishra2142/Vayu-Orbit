import React, { useEffect, useState } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Planning from './pages/JourneyPlanning';
import Convoy from './pages/ConvoyBuilder';
import RouteAssessment from './pages/RouteAssessment';
import Preview from './pages/JourneyPreview';
import Operations from './pages/JourneyOperations';
import History from './pages/JourneyHistory';
import Fleet from './pages/FleetManagement';
import Places from './pages/PlaceManagement';
import Analytics from './pages/Analytics';
import JourneyReport from './pages/JourneyReport';
import Settings from './pages/ProfileSettings';
import About from './pages/AboutCMS';
import ErrorBoundary from './components/ErrorBoundary';
import { api, setUnauthorizedHandler } from './services/api';
import { getPreferences, applyThemeToDocument } from './services/preferences';

const DRAFT_KEY = 'vayu_active_planning_draft_v1';
const OPS_JOURNEY_KEY = 'vayu_active_operations_journey_id';
const PLANNING_PAGES = ['Journey Planning', 'Convoy Builder', 'Route Assessment', 'Final Journey Preview'];

function loadStoredDraft() {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const page = PLANNING_PAGES.includes(data.page) ? data.page : 'Journey Planning';
    const draft = {
      origin: typeof data.origin === 'string' ? data.origin : '',
      dest: typeof data.dest === 'string' ? data.dest : '',
      originName: typeof data.originName === 'string' ? data.originName : '',
      destName: typeof data.destName === 'string' ? data.destName : '',
      date: typeof data.date === 'string' ? data.date : '',
      time: typeof data.time === 'string' ? data.time : '',
      convoy: Array.isArray(data.convoy) ? data.convoy : [],
      convoy_speed_kmh: Number(data.convoy_speed_kmh) || 0,
      max_vehicle_tons: Number(data.max_vehicle_tons) || 0,
      total_convoy_weight: Number(data.total_convoy_weight) || 0,
      total_convoy_occupants: Number(data.total_convoy_occupants) || 0,
      total_convoy_cargo: Number(data.total_convoy_cargo) || 0,
      route: data.route && typeof data.route === 'object' ? data.route : null,
      routes: Array.isArray(data.routes) ? data.routes : [],
      placeMap: data.placeMap && typeof data.placeMap === 'object' ? data.placeMap : {},
      staged_journey_id: typeof data.staged_journey_id === 'string' ? data.staged_journey_id : null
    };
    return { page, draft };
  } catch (err) {
    console.warn('Malformed or invalid session draft ignored:', err);
    return null;
  }
}

function App() {
  // Phase 1 Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  // Core Application State (Preserving Step 1–6 baselines)
  const initial = loadStoredDraft();
  const [page, setPage] = useState(initial ? initial.page : 'Overview');
  const [health, setHealth] = useState(false);
  const [draftMission, setDraftMission] = useState(initial ? initial.draft : {});
  const [operationsJourney, setOperationsJourney] = useState(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState('');
  const [reportJourneyId, setReportJourneyId] = useState(null);

  // Register Global 401 Interceptor to clear frontend auth state
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setCurrentUser(null);
    });
  }, []);

  // Restore theme from localStorage on initial mount
  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem('vayu_theme');
      if (storedTheme === 'light' || storedTheme === 'dark') {
        applyThemeToDocument(storedTheme);
      }
    } catch {}
  }, []);

  // Check existing session on mount via GET /api/auth/me
  useEffect(() => {
    api.getMe()
      .then(res => {
        if (res && res.user) {
          setCurrentUser(res.user);
          setIsAuthenticated(true);
          const prefs = getPreferences(res.user);
          if (prefs && prefs.theme) {
            applyThemeToDocument(prefs.theme);
          }
        } else {
          setIsAuthenticated(false);
          setCurrentUser(null);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        setCurrentUser(null);
      })
      .finally(() => {
        setIsAuthenticating(false);
      });
  }, []);

  // Health check polling (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    api.health().then(() => setHealth(true)).catch(() => setHealth(false));
    const id = setInterval(() => {
      api.health().then(() => setHealth(true)).catch(() => setHealth(false));
    }, 30000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Restore operations journey on refresh if available
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const storedOpsId = window.sessionStorage.getItem(OPS_JOURNEY_KEY);
      if (storedOpsId && !operationsJourney) {
        setOperationsLoading(true);
        api.journey(storedOpsId).then(j => {
          setOperationsJourney(j);
          setPage(prevPage => (prevPage === 'Overview' || !prevPage) ? 'Journey Operations' : prevPage);
        }).catch(err => {
          setOperationsError(err.message || `Failed to reload journey ${storedOpsId}`);
        }).finally(() => {
          setOperationsLoading(false);
        });
      }
    } catch {}
  }, [isAuthenticated]);

  // Synchronize active planning draft to sessionStorage (Preventing empty state overwrites)
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const hasContent = Boolean(
        draftMission && (
          draftMission.origin ||
          draftMission.dest ||
          (Array.isArray(draftMission.convoy) && draftMission.convoy.length > 0) ||
          draftMission.date ||
          draftMission.staged_journey_id
        )
      );

      if (hasContent) {
        if (PLANNING_PAGES.includes(page)) {
          const payload = { ...draftMission, page };
          window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        } else {
          // Keep draft preserved when navigating away to Fleet/Places/History
          const payload = { ...draftMission, page: draftMission.lastPlanningPage || 'Journey Planning' };
          window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        }
      }
    } catch (e) {
      console.warn('Failed to store planning draft:', e);
    }
  }, [page, draftMission, isAuthenticated]);

  // Explicit draft reset handler
  const resetPlanning = () => {
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    setDraftMission({});
    setPage('Journey Planning');
  };

  // Open historical journey into Operations (completely isolated from planning draft)
  const handleOpenHistoricalJourney = async (journeyId) => {
    if (!journeyId) {
      setOperationsError('Invalid Journey ID.');
      setOperationsJourney(null);
      setPage('Journey Operations');
      return;
    }
    setOperationsLoading(true);
    setOperationsError('');
    setOperationsJourney(null); // Clear previous journey to prevent showing stale details
    setPage('Journey Operations');
    try {
      const full = await api.journey(journeyId);
      setOperationsJourney(full);
      try {
        window.sessionStorage.setItem(OPS_JOURNEY_KEY, journeyId);
      } catch {}
    } catch (err) {
      setOperationsError(err.message || `Failed to load journey ${journeyId}`);
      try {
        window.sessionStorage.removeItem(OPS_JOURNEY_KEY);
      } catch {}
    } finally {
      setOperationsLoading(false);
    }
  };

  // Open journey into Get Your Journey Report
  const handleOpenJourneyReport = (journeyId) => {
    setReportJourneyId(journeyId || null);
    setPage('Get Your Journey Report');
  };

  // Expose global hooks for programmatic testing
  useEffect(() => {
    window.vayuResetPlanningDraft = resetPlanning;
    window.vayuOpenHistoricalJourney = handleOpenHistoricalJourney;
    window.vayuOpenJourneyReport = handleOpenJourneyReport;
    return () => {
      delete window.vayuResetPlanningDraft;
      delete window.vayuOpenHistoricalJourney;
      delete window.vayuOpenJourneyReport;
    };
  }, []);

  const updateDraft = (m, targetPage) => {
    setDraftMission(prev => {
      const nextMission = typeof m === 'function' ? m(prev || {}) : m;
      const merged = { ...(prev || {}), ...(nextMission || {}) };
      if (targetPage) merged.lastPlanningPage = targetPage;
      try {
        const payload = { ...merged, page: targetPage || page };
        window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn('Failed to store planning draft synchronously:', e);
      }
      return merged;
    });
  };

  const updatePlanningWithPlaces = (m) => {
    updateDraft(m, 'Journey Planning');
    api.places().then(p => {
      if (!Array.isArray(p)) return;
      setDraftMission(prev => {
        const origId = (prev.origin || '').replace('PLC-', '');
        const dstId = (prev.dest || '').replace('PLC-', '');
        const origPlace = p.find(x => x.place_id === prev.origin || x.place_id.replace('PLC-', '') === origId);
        const dstPlace = p.find(x => x.place_id === prev.dest || x.place_id.replace('PLC-', '') === dstId);
        const placeMap = {
          ...(prev.placeMap || {}),
          ...Object.fromEntries(p.map(x => [x.place_id.replace('PLC-', ''), x])),
          ...Object.fromEntries(p.map(x => [x.place_id, x]))
        };
        const updated = {
          ...prev,
          placeMap,
          originName: prev.originName || origPlace?.place_name || prev.origin,
          destName: prev.destName || dstPlace?.place_name || prev.dest
        };
        try {
          const payload = { ...updated, page: prev.lastPlanningPage || 'Journey Planning' };
          window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        } catch {}
        return updated;
      });
    }).catch(err => {
      console.warn('Place resolution background warning:', err);
    });
  };

  const handlePreviewSetMission = (m) => {
    if (typeof m !== 'function' && m && m.journey && m.journey.journey_id) {
      // Successful journey creation commits draft and clears it from session storage
      setOperationsJourney(m.journey);
      try {
        window.sessionStorage.setItem(OPS_JOURNEY_KEY, m.journey.journey_id);
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      setDraftMission({});
    } else {
      updateDraft(m, 'Final Journey Preview');
    }
  };

  // Auth actions
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout error:', err);
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
    }
  };

  // Resolving session loading view
  if (isAuthenticating) {
    return (
      <div className="auth-resolving-screen">
        <div className="auth-resolving-card">
          <div className="auth-resolving-logo-frame">
            <img src="/vayu.png" alt="VAYU ORBIT" className="auth-resolving-logo" />
          </div>
          <div className="auth-resolving-title">VAYU ORBIT</div>
          <div className="auth-resolving-status">
            <span className="auth-pulse-dot" />
            <span>INITIALIZING SECURE SESSION...</span>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated view
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Authenticated application layout
  const render = {
    Overview: <Overview setPage={setPage} currentUser={currentUser} onOpenJourney={handleOpenHistoricalJourney} />,
    'Journey Planning': <Planning setPage={setPage} mission={draftMission} setMission={updatePlanningWithPlaces} resetPlanning={resetPlanning} currentUser={currentUser} />,
    'Convoy Builder': <Convoy setPage={setPage} mission={draftMission} setMission={m => updateDraft(m, 'Convoy Builder')} currentUser={currentUser} />,
    'Route Assessment': <RouteAssessment mission={draftMission} setMission={m => updateDraft(m, 'Route Assessment')} setPage={setPage} currentUser={currentUser} />,
    'Final Journey Preview': <Preview mission={draftMission} setMission={handlePreviewSetMission} setPage={setPage} currentUser={currentUser} />,
    'Journey Operations': <Operations mission={draftMission} journey={operationsJourney} loading={operationsLoading} error={operationsError} setPage={setPage} onUpdateJourney={setOperationsJourney} currentUser={currentUser} />,
    'Journey History': <History onOpenJourney={handleOpenHistoricalJourney} onOpenReport={handleOpenJourneyReport} currentUser={currentUser} />,
    'Fleet Management': <Fleet currentUser={currentUser} />,
    'Place Management': <Places currentUser={currentUser} />,
    Analytics: <Analytics currentUser={currentUser} setPage={setPage} onOpenJourney={handleOpenHistoricalJourney} />,
    'Get Your Journey Report': <JourneyReport initialJourneyId={reportJourneyId} onSelectJourneyId={setReportJourneyId} currentUser={currentUser} onOpenOperations={handleOpenHistoricalJourney} />,
    'Scenario Lab': <JourneyReport initialJourneyId={reportJourneyId} onSelectJourneyId={setReportJourneyId} currentUser={currentUser} onOpenOperations={handleOpenHistoricalJourney} />,
    'Profile & Settings': <Settings currentUser={currentUser} onLogout={handleLogout} />,
    'About CMS': <About currentUser={currentUser} />
  };

  return (
    <Layout
      page={page}
      setPage={setPage}
      health={health}
      currentUser={currentUser}
      onLogout={handleLogout}
    >
      <ErrorBoundary key={page} onNavigateOverview={() => setPage('Overview')}>
        {render[page]}
      </ErrorBoundary>
    </Layout>
  );
}

export default App;
