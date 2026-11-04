import React from 'react';
import { AlertTriangle, RefreshCw, Compass } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px 24px',
          maxWidth: 640,
          margin: '40px auto',
          background: 'var(--color-surface, #193442)',
          border: '1px solid var(--color-danger-border, #A10F18)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          color: 'var(--color-text-primary, #F4EFE6)',
          fontFamily: "'Inter', sans-serif"
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(161, 15, 24, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-danger, #A10F18)'
            }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Component Render Error</h2>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted, #8FAAB7)', marginTop: 2 }}>
                {this.props.fallbackTitle || 'The requested view encountered a runtime exception.'}
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--color-bg, #101D26)',
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--color-danger, #F48CA0)',
            marginBottom: 20,
            overflowX: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            {this.state.error?.message || 'Unknown runtime error'}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={this.handleReset}
            >
              <RefreshCw size={14} /> Try Reloading View
            </button>
            {this.props.onNavigateOverview && (
              <button
                type="button"
                className="btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={this.props.onNavigateOverview}
              >
                <Compass size={14} /> Return to Overview
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
