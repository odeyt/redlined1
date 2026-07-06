'use client';

import { useEffect, useState } from 'react';

interface TestSuite {
  title: string;
  tests: TestResult[];
  duration?: number;
}

interface TestResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration?: number;
  error?: string;
}

interface PlaywrightReport {
  stats?: {
    expected: number;
    unexpected: number;
    skipped: number;
    duration: number;
    startTime: string;
  };
  suites?: TestSuite[];
}

export function TestingDashboardView() {
  const [report, setReport]   = useState<PlaywrightReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/test-results')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else if (d.message) setError(d.message);
        else setReport(d.results);
      })
      .catch(() => setError('Failed to load test results'))
      .finally(() => setLoading(false));
  }, []);

  const stats = report?.stats;
  const total      = (stats?.expected ?? 0) + (stats?.unexpected ?? 0) + (stats?.skipped ?? 0);
  const passed     = stats?.expected   ?? 0;
  const failed     = stats?.unexpected ?? 0;
  const skipped    = stats?.skipped    ?? 0;
  const durationSec = stats ? (stats.duration / 1000).toFixed(1) : '—';

  const statusColor = (s: string) => {
    if (s === 'passed')   return 'text-green-600';
    if (s === 'failed' || s === 'timedOut') return 'text-red-600';
    return 'text-gray-400';
  };

  const statusBg = (s: string) => {
    if (s === 'passed')   return 'bg-green-50';
    if (s === 'failed' || s === 'timedOut') return 'bg-red-50';
    return 'bg-gray-50';
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Testing Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Owner-only — Playwright E2E regression results</p>
      </div>

      {loading && <p className="text-gray-500">Loading test results…</p>}
      {error   && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800">
          {error}
          <div className="mt-2 font-mono text-xs">npm run test:e2e</div>
        </div>
      )}

      {report && stats && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total',   value: total,      color: 'text-gray-800' },
              { label: 'Passed',  value: passed,     color: 'text-green-600' },
              { label: 'Failed',  value: failed,     color: failed > 0 ? 'text-red-600' : 'text-gray-400' },
              { label: 'Skipped', value: skipped,    color: 'text-gray-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border rounded-lg p-4 text-center">
                <div className={`text-3xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="text-sm text-gray-500">
            Run time: <span className="font-medium">{durationSec}s</span>
            {stats.startTime && (
              <> · Started: <span className="font-medium">{new Date(stats.startTime).toLocaleString()}</span></>
            )}
          </div>

          {/* Suite breakdown */}
          {report.suites?.map((suite, si) => (
            <div key={si} className="bg-white border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b font-medium text-sm">{suite.title}</div>
              <div className="divide-y">
                {suite.tests.map((t, ti) => (
                  <div key={ti} className={`px-4 py-3 flex items-start gap-3 ${statusBg(t.status)}`}>
                    <span className={`text-xs font-bold uppercase mt-0.5 w-14 shrink-0 ${statusColor(t.status)}`}>
                      {t.status === 'timedOut' ? 'TIMEOUT' : t.status.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{t.title}</div>
                      {t.error && (
                        <pre className="text-xs text-red-700 mt-1 whitespace-pre-wrap break-all">{t.error}</pre>
                      )}
                    </div>
                    {t.duration && (
                      <span className="text-xs text-gray-400 shrink-0">{(t.duration / 1000).toFixed(2)}s</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
