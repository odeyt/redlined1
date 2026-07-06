/**
 * API route monitoring wrapper.
 * Wraps a Next.js route handler to capture duration, status codes, and errors.
 *
 * Usage:
 *   export const GET = withApiMonitor('/api/my-route', async (req) => {
 *     return NextResponse.json({ ok: true });
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { logApiError, logInfo } from './logger';

type RouteHandler = (
  req: NextRequest,
  ctx?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

export function withApiMonitor(route: string, handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
    const start = Date.now();
    const method = req.method ?? 'UNKNOWN';

    try {
      const response = await handler(req, ctx);
      const durationMs = Date.now() - start;
      const status = response.status;

      if (status >= 500) {
        logApiError({ route, method, statusCode: status, durationMs });
      } else if (status >= 400 && process.env.NODE_ENV !== 'production') {
        logInfo(`API ${method} ${route} → ${status} (${durationMs}ms)`);
      }

      return response;
    } catch (err) {
      const durationMs = Date.now() - start;
      logApiError({
        route,
        method,
        statusCode: 500,
        durationMs,
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      // Re-throw — let Next.js handle the 500 response
      throw err;
    }
  };
}

/** Lightweight version that just logs slow requests (> thresholdMs). */
export function withSlowRequestAlert(
  route: string,
  handler: RouteHandler,
  thresholdMs = 3000,
): RouteHandler {
  return async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
    const start = Date.now();
    const response = await handler(req, ctx);
    const durationMs = Date.now() - start;

    if (durationMs > thresholdMs) {
      logApiError({
        route,
        method: req.method,
        statusCode: response.status,
        durationMs,
        errorMessage: `Slow request: ${durationMs}ms (threshold: ${thresholdMs}ms)`,
      });
    }

    return response;
  };
}
