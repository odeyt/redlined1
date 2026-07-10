'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class CustomerIntelligenceErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error) {
    console.warn('[CustomerIntelligence] Panel error (isolated):', error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="text-xs text-muted-foreground p-2">
          Customer intelligence unavailable
        </div>
      );
    }
    return this.props.children;
  }
}
