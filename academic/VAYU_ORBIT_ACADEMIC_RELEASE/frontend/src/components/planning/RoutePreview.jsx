import React from 'react';

export default function RoutePreview({ status, route, error, onRetry }) {
  return (
    <section className="card route-preview-card" aria-live="polite" aria-label="Tactical route preview">
      <div className="preview-header">
        <h2 className="preview-title">Route Preview</h2>
        {status === 'ready' && <span className="preview-status-pill ready">COMPUTED</span>}
        {status === 'loading' && <span className="preview-status-pill loading">ASSESSING</span>}
        {status === 'idle' && <span className="preview-status-pill idle">STANDBY</span>}
      </div>

      {status === 'idle' && (
        <p className="preview-muted">
          Select origin and destination nodes to view corridor preview.
        </p>
      )}

      {status === 'loading' && (
        <div className="preview-loading">
          <span className="preview-pulse-dot" />
          <p className="preview-muted">Calculating tactical corridor parameters…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="preview-error-state">
          <p className="preview-err-text">Tactical corridor unavailable: {error}</p>
          <button type="button" className="btn" onClick={onRetry} style={{ marginTop: 8 }}>
            Retry Calculation
          </button>
        </div>
      )}

      {status === 'ready' && route && (
        <div className="preview-ready-state">
          <dl className="preview-stats">
            <div className="stat-item">
              <dt>Distance</dt>
              <dd>{route.distanceKm} km</dd>
            </div>
            <div className="stat-item">
              <dt>Est. Transit Time</dt>
              <dd>{route.etaHours} h</dd>
            </div>
            <div className="stat-item">
              <dt>Corridor Risk Score</dt>
              <dd className={`risk-val ${route.riskScore >= 40 ? 'bad' : route.riskScore >= 20 ? 'warn' : 'ok'}`}>
                {route.riskScore}
              </dd>
            </div>
          </dl>

          {route.explanation && (
            <p className="preview-explanation">{route.explanation}</p>
          )}

          <p className="preview-source">
            Routing Engine: {route.source.name}
          </p>
        </div>
      )}
    </section>
  );
}
