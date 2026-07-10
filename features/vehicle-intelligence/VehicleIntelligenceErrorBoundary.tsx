'use client';
import React from 'react';

interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { hasError: boolean }

export class VehicleIntelligenceErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(e: Error) { console.error('[VehicleIntelligenceErrorBoundary]', e); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="text-xs text-gray-400 p-2">Vehicle intelligence unavailable</div>
      );
    }
    return this.props.children;
  }
}
