'use client';

import React from 'react';
import { logger } from '@/lib/logger';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('UI error boundary caught exception', error, {
      module: 'ErrorBoundary',
      componentStack: info.componentStack ?? undefined,
    });
    // SENTRY_HOOK: Sentry.captureException(error, { extra: info });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg, #f0f0f0)',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--surface, #fff)',
            border: '1px solid #fca5a5',
            borderRadius: 12,
            padding: '36px 32px',
            maxWidth: 480,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, color: '#cc0000' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#666', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
              The application hit an unexpected error. Your data is safe — this is a display issue only.
            </p>
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <pre style={{
                background: '#1a1a1a',
                color: '#ff8080',
                borderRadius: 8,
                padding: 12,
                fontSize: 11,
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: 20,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack?.slice(0, 800)}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReset}
                className="btn primary"
                style={{ minWidth: 140 }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn"
                style={{ minWidth: 140 }}
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
