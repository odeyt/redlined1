'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class ServiceAdvisorErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Non-blocking — log but don't surface
    console.error('[ServiceAdvisor] Panel error caught by boundary:', error.message, info.componentStack?.slice(0, 200));
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, marginTop: 8 }}>
          Service Advisor panel unavailable. Your estimate continues to work normally.
        </div>
      );
    }
    return this.props.children;
  }
}
