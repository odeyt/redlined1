import { NextResponse } from 'next/server';
import { getHealth } from '@/intelligence/IntelligenceService';

export async function GET() {
  try {
    const status = await getHealth();
    const httpStatus = status.status === 'offline' ? 503 : 200;
    return NextResponse.json(status, { status: httpStatus });
  } catch {
    return NextResponse.json(
      {
        provider: 'unknown',
        status: 'offline',
        mockMode: true,
        lastEventAt: null,
        queueSize: 0,
        environment: process.env.NODE_ENV ?? 'unknown',
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
