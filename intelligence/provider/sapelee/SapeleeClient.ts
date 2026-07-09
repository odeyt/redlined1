// SI-8: Sapelee API Client
// Thin HTTP adapter. All endpoints have mock-safe fallbacks.
// If Sapelee is unreachable, every function returns a safe default — never throws.

const DEFAULT_TIMEOUT_MS = 8000;

// ── Response types ────────────────────────────────────────────

export interface SapeleeHealthResponse {
  status: 'ok' | 'degraded' | 'offline';
  version?: string;
  checkedAt: string;
}

export interface SapeleeBriefEnhancement {
  executiveSummary: string;
  strategicAdvice: string;
  revenueFocus: string;
  riskFocus: string;
  ownerCoaching: string;
  confidence: number;        // 0.0–1.0
  generatedAt: string;
  mockMode: boolean;
}

export interface SapeleeExecutiveAdvice {
  summary: string;
  topActions: string[];
  confidence: number;
  generatedAt: string;
  mockMode: boolean;
}

// ── Config ────────────────────────────────────────────────────

function getConfig(): { apiUrl: string; apiKey: string; companyId: string; configured: boolean } {
  const apiUrl    = process.env.SAPELEE_API_URL    ?? '';
  const apiKey    = process.env.SAPELEE_API_KEY    ?? '';
  const companyId = process.env.SAPELEE_COMPANY_ID ?? '';
  return { apiUrl, apiKey, companyId, configured: !!(apiUrl && apiKey) };
}

// ── HTTP helper ───────────────────────────────────────────────

async function safePost<T>(
  path: string,
  body: unknown,
  fallback: T,
): Promise<T> {
  const cfg = getConfig();
  if (!cfg.configured) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${cfg.apiUrl}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-API-Key':       cfg.apiKey,
        'X-Company-Id':    cfg.companyId,
        'X-Client':        'redlined1',
        'X-Client-Version': '1.0',
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch {
    clearTimeout(timer);
    return fallback;
  }
}

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  const cfg = getConfig();
  if (!cfg.configured) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${cfg.apiUrl}${path}`, {
      method:  'GET',
      headers: {
        'X-API-Key':    cfg.apiKey,
        'X-Company-Id': cfg.companyId,
        'X-Client':     'redlined1',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch {
    clearTimeout(timer);
    return fallback;
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Send an anonymized operational event to Sapelee.
 * Fire-and-forget safe — never throws, never blocks.
 * TODO: confirm exact endpoint path with Sapelee team.
 */
export async function sendEvent(payload: unknown): Promise<void> {
  await safePost('/api/external/events', payload, undefined);
}

/**
 * Request an executive enhancement for a morning brief.
 * Returns local fallback if Sapelee is unavailable.
 * TODO: confirm request/response schema with Sapelee team.
 */
export async function requestMorningBriefEnhancement(
  payload: unknown,
): Promise<SapeleeBriefEnhancement> {
  const cfg = getConfig();
  const fallback: SapeleeBriefEnhancement = {
    executiveSummary: '',
    strategicAdvice:  '',
    revenueFocus:     '',
    riskFocus:        '',
    ownerCoaching:    '',
    confidence:       0,
    generatedAt:      new Date().toISOString(),
    mockMode:         !cfg.configured,
  };
  return safePost<SapeleeBriefEnhancement>(
    '/api/external/morning-brief/enhance',
    payload,
    fallback,
  );
}

/**
 * Request high-level executive advice from Sapelee.
 * Returns local fallback if unavailable.
 * TODO: confirm endpoint + schema with Sapelee team.
 */
export async function requestExecutiveAdvice(
  payload: unknown,
): Promise<SapeleeExecutiveAdvice> {
  const cfg = getConfig();
  const fallback: SapeleeExecutiveAdvice = {
    summary:     '',
    topActions:  [],
    confidence:  0,
    generatedAt: new Date().toISOString(),
    mockMode:    !cfg.configured,
  };
  return safePost<SapeleeExecutiveAdvice>(
    '/api/external/executive-advice',
    payload,
    fallback,
  );
}

/**
 * Check Sapelee connectivity.
 * Returns offline status if unconfigured or unreachable.
 */
export async function getHealth(): Promise<SapeleeHealthResponse & { configured: boolean }> {
  const cfg = getConfig();
  if (!cfg.configured) {
    return { status: 'offline', configured: false, checkedAt: new Date().toISOString() };
  }
  const result = await safeGet<SapeleeHealthResponse>('/api/external/health', {
    status:    'offline',
    checkedAt: new Date().toISOString(),
  });
  return { ...result, configured: true };
}

/** Returns true if Sapelee is configured and reachable. */
export async function isSapeleeReachable(): Promise<boolean> {
  const h = await getHealth();
  return h.configured && h.status !== 'offline';
}
