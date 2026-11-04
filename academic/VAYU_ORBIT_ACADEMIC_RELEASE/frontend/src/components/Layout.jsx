import React, { useState, useEffect, useRef } from 'react';
import {
  Menu, X, ChevronDown, LayoutDashboard, MapPinned, Truck, Route, Eye,
  PlayCircle, History, MapPin, BarChart3, FileText,
  Settings, Info, LogOut, Sun, Moon
} from 'lucide-react';
import {
  getPreferences,
  subscribePreferences,
  CLOCK_FORMATS,
  DATE_FORMATS,
  SIDEBAR_STATES,
  THEMES,
  setTheme,
  getEffectiveTheme
} from '../services/preferences';

const NAV = [
  ['Command',    'Overview',              LayoutDashboard],
  ['Command',    'Journey Planning',      MapPinned],
  ['Command',    'Convoy Builder',        Truck],
  ['Command',    'Route Assessment',      Route],
  ['Command',    'Final Journey Preview', Eye],
  ['Command',    'Journey Operations',   PlayCircle],
  ['Management', 'Fleet Management',     Truck],
  ['Management', 'Place Management',     MapPin],
  ['Management', 'Journey History',      History],
  ['Analytics',  'Analytics',            BarChart3],
  ['Analytics',  'Get Your Journey Report', FileText],
  ['System',     'Profile & Settings',   Settings],
  ['System',     'About CMS',            Info],
];
const GROUPS = ['Command', 'Management', 'Analytics', 'System'];

function Clock({ format = CLOCK_FORMATS.H24, dateFormat = DATE_FORMATS.DD_MMM_YYYY }) {
  const [dateTimeStr, setDateTimeStr] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      let datePart = '';
      if (dateFormat === DATE_FORMATS.YYYY_MM_DD) {
        datePart = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      } else if (dateFormat === DATE_FORMATS.DD_MM_YYYY) {
        datePart = now.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      } else {
        // DD-MMM-YYYY default (e.g. 30-Oct-2026)
        datePart = now.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).replace(/ /g, '-');
      }
      const timePart = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: format === CLOCK_FORMATS.H12
      });
      setDateTimeStr(`${datePart} | ${timePart}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [format, dateFormat]);
  return (
    <div className="top-clock" title={`Kolkata Standard Time (IST) — ${format === CLOCK_FORMATS.H12 ? '12-Hour' : '24-Hour'} format`}>
      <span className="top-clock-time">{dateTimeStr}</span>
      <span className="top-clock-tz">IST</span>
    </div>
  );
}

export default function Layout({ page, setPage, health, children, currentUser, onLogout }) {
  const initialPrefs = getPreferences(currentUser);
  const [clockFormat, setClockFormat] = useState(initialPrefs.clockFormat);
  const [dateFormat, setDateFormat] = useState(initialPrefs.dateFormat || DATE_FORMATS.DD_MMM_YYYY);
  const [collapsed, setCollapsed] = useState(initialPrefs.sidebarState === SIDEBAR_STATES.COLLAPSED);
  const [currentTheme, setCurrentTheme] = useState(() => getEffectiveTheme(currentUser));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const mobileTriggerRef = useRef(null);
  const accountWrapRef = useRef(null);
  const sidebarRef = useRef(null);

  const userInitials = currentUser?.email
    ? currentUser.email.split('@')[0].slice(0, 2).toUpperCase()
    : 'OP';
  const userRole = currentUser?.role || 'OPERATOR';
  const userEmail = currentUser?.email || 'operator@vayu.local';

  // Synchronize when currentUser changes
  useEffect(() => {
    const prefs = getPreferences(currentUser);
    setClockFormat(prefs.clockFormat);
    setDateFormat(prefs.dateFormat || DATE_FORMATS.DD_MMM_YYYY);
    setCollapsed(prefs.sidebarState === SIDEBAR_STATES.COLLAPSED);
    if (prefs.theme) {
      setCurrentTheme(prefs.theme);
    }
  }, [currentUser]);

  // Subscribe to live preference updates across the app
  useEffect(() => {
    const unsubscribe = subscribePreferences((newPrefs) => {
      if (newPrefs.clockFormat) {
        setClockFormat(newPrefs.clockFormat);
      }
      if (newPrefs.dateFormat) {
        setDateFormat(newPrefs.dateFormat);
      }
      if (newPrefs.sidebarState) {
        setCollapsed(newPrefs.sidebarState === SIDEBAR_STATES.COLLAPSED);
      }
      if (newPrefs.theme) {
        setCurrentTheme(newPrefs.theme);
      }
    });
    return unsubscribe;
  }, []);

  // Listen for custom theme change events
  useEffect(() => {
    const handleThemeEvent = (e) => {
      if (e?.detail?.theme) {
        setCurrentTheme(e.detail.theme);
      }
    };
    window.addEventListener('vayu_theme_changed', handleThemeEvent);
    return () => window.removeEventListener('vayu_theme_changed', handleThemeEvent);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = currentTheme === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;
    setCurrentTheme(nextTheme);
    setTheme(currentUser, nextTheme);
  };

  // Handle global navigation events (e.g. from footer links)
  useEffect(() => {
    function handleNav(e) {
      if (e?.detail && typeof e.detail === 'string') {
        setPage(e.detail);
      }
    }
    window.addEventListener('vayu_navigate', handleNav);
    return () => window.removeEventListener('vayu_navigate', handleNav);
  }, [setPage]);

  // Trigger Leaflet map resize when sidebar collapses or expands
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 220);
    return () => clearTimeout(timer);
  }, [collapsed]);

  // Handle keyboard events (Escape key) and click outside
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (accountMenuOpen) {
          setAccountMenuOpen(false);
        }
        if (mobileOpen) {
          setMobileOpen(false);
          if (mobileTriggerRef.current) {
            mobileTriggerRef.current.focus();
          }
        }
      }
    }

    function handleClickOutside(e) {
      if (accountWrapRef.current && !accountWrapRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [accountMenuOpen, mobileOpen]);

  const handleNavClick = (label) => {
    setPage(label);
    if (mobileOpen) {
      setMobileOpen(false);
      if (mobileTriggerRef.current) {
        mobileTriggerRef.current.focus();
      }
    }
  };

  return (
    <div className={`app${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* ── Mobile Backdrop ── */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => {
            setMobileOpen(false);
            if (mobileTriggerRef.current) mobileTriggerRef.current.focus();
          }}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        ref={sidebarRef}
        className={`side${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
        aria-label="Sidebar Navigation"
      >
        {/* Brand header */}
        <div className="brand">
          {collapsed ? (
            <button
              className="hamb-btn hamb-rail"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <Menu size={18} />
            </button>
          ) : (
            <div className="brand-inner">
              <div className="brand-identity">
                <div className="brand-logo-frame">
                  <img src="/vayu_logo.png" alt="VAYU ORBIT" className="brand-logo-img" />
                </div>
                <div className="brand-text">
                  <span className="brand-name">VAYU ORBIT</span>
                  <span className="brand-tagline">Intelligent Convoy Planning</span>
                </div>
              </div>
              <button
                className="hamb-btn"
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <Menu size={18} />
              </button>
              {mobileOpen && (
                <button
                  className="mobile-close-btn"
                  onClick={() => {
                    setMobileOpen(false);
                    if (mobileTriggerRef.current) mobileTriggerRef.current.focus();
                  }}
                  title="Close navigation"
                  aria-label="Close navigation"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="nav" aria-label="Main Navigation">
          {GROUPS.map((group, groupIdx) => (
            <div key={group} className="nav-group-section">
              {!collapsed && <div className="nav-group-label">{group}</div>}
              {collapsed && groupIdx > 0 && <div className="nav-group-divider" aria-hidden="true" />}
              {NAV.filter(([g]) => g === group).map(([, label, Icon]) => {
                const isActive = page === label;
                return (
                  <button
                    key={label}
                    className={`nav-btn${isActive ? ' active' : ''}`}
                    title={label}
                    aria-label={label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => handleNavClick(label)}
                  >
                    <Icon size={16} className="nav-icon" />
                    {!collapsed && <span className="nav-label">{label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main Application Column ── */}
      <div className="main">
        {/* Global 64px Header */}
        <header className="top" role="banner">
          <div className="top-left">
            <button
              ref={mobileTriggerRef}
              className="mobile-nav-toggle"
              onClick={() => setMobileOpen(true)}
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
              aria-expanded={mobileOpen}
            >
              <Menu size={20} />
            </button>

            {/* Product Identity & Environment Badge */}
            <div className="top-identity-group">
              {collapsed && (
                <>
                  <img src="/vayu_logo.png" alt="VAYU ORBIT" className="top-collapsed-logo" />
                  <span className="top-product-name">VAYU ORBIT</span>
                </>
              )}
              <span className="top-env-badge">Simulation Environment</span>
            </div>

            {/* Subtle Breadcrumb Separator */}
            <span className="top-breadcrumb-sep" aria-hidden="true">/</span>

            {/* Current Page Context */}
            <div className="top-page-context">
              <span className="top-page-label">{page}</span>
            </div>
          </div>

          <div className="top-right">
            {/* Backend Connection Status Indicator */}
            <div
              className={`conn-indicator ${health ? 'online' : 'offline'}`}
              title={`API Connection: ${health ? 'Connected (http://127.0.0.1:8000)' : 'Connecting / Unreachable'}`}
            >
              <span className="conn-dot" aria-hidden="true" />
              <span className="conn-label">{health ? 'API connected' : 'Connecting…'}</span>
            </div>

            {/* Live IST Clock */}
            <Clock format={clockFormat} dateFormat={dateFormat} />

            {/* Quick Theme Toggle */}
            <button
              type="button"
              className="top-theme-toggle"
              onClick={handleToggleTheme}
              title={`Active: ${currentTheme === THEMES.LIGHT ? 'Light Mode' : 'Dark Mode'}. Click to switch to ${currentTheme === THEMES.LIGHT ? 'Dark Mode' : 'Light Mode'}.`}
              aria-label={`Switch to ${currentTheme === THEMES.LIGHT ? 'Dark Mode' : 'Light Mode'}`}
            >
              {currentTheme === THEMES.LIGHT ? (
                <Sun size={14} className="theme-toggle-icon sun" aria-hidden="true" />
              ) : (
                <Moon size={14} className="theme-toggle-icon moon" aria-hidden="true" />
              )}
              <span className="top-theme-toggle-text">
                {currentTheme === THEMES.LIGHT ? 'LIGHT' : 'DARK'}
              </span>
            </button>

            {/* Single Consolidated Account Menu Dropdown */}
            <div className="account-dropdown-wrap" ref={accountWrapRef}>
              <button
                className={`account-btn${accountMenuOpen ? ' active' : ''}`}
                onClick={() => setAccountMenuOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-label="Operator account menu"
                title={`${userEmail} (${userRole})`}
              >
                <span className="account-avatar">{userInitials}</span>
                <span className="account-meta">
                  <span className="account-email">{userEmail}</span>
                  <span className="account-role-badge">{userRole}</span>
                </span>
                <ChevronDown size={14} className={`account-chevron${accountMenuOpen ? ' rotated' : ''}`} />
              </button>

              {accountMenuOpen && (
                <div className="account-menu" role="menu" aria-label="Account actions">
                  <div className="account-menu-header">
                    <div className="account-menu-user-row">
                      <span className="account-menu-avatar">{userInitials}</span>
                      <div className="account-menu-user-meta">
                        <span className="account-menu-email">{userEmail}</span>
                        <span className="account-menu-role">{userRole}</span>
                      </div>
                    </div>
                    <div className="account-menu-status">
                      <span className="account-status-dot" />
                      <span>Authenticated Session</span>
                    </div>
                  </div>
                  <div className="account-menu-divider" />
                  <button
                    className="account-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setPage('Profile & Settings');
                    }}
                  >
                    <Settings size={14} />
                    <span>Profile & Settings</span>
                  </button>
                  <div className="account-menu-divider" />
                  <button
                    className="account-menu-item signout-item"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable page workspace */}
        <main className="page-scroll" role="main">
          {children}
        </main>
      </div>
    </div>
  );
}
