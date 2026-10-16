import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { simulatorCommandSchema } from '@/lib/academy/simulation-policy';
import { checkSimulationStage, simulationState, SimulationError } from '@/lib/academy/simulation-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const limited = await checkRateLimit(req, { maxRequests: 60, windowMs: 60000, failClosed: true }, user.id, 'academy-simulator-read');
    if (limited) return limited;
    try {
      return NextResponse.json(await simulationState(user.id), { headers });
    } catch (error) {
      console.error('Academy simulation state unavailable', error);
      return NextResponse.json({ error: 'Simulation records are temporarily unavailable.' }, { status: 503, headers });
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403, headers });
    }
    const limited = await checkRateLimit(req, { maxRequests: 30, windowMs: 60000, failClosed: true }, user.id, 'academy-simulator-grade');
    if (limited) return limited;
    const parsed = simulatorCommandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid configuration request' }, { status: 400, headers });
    try {
      return NextResponse.json(await checkSimulationStage(user.id, parsed.data.stageId, parsed.data.selections), { headers });
    } catch (error) {
      if (error instanceof SimulationError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
      }
      console.error('Academy simulation grading failed', error);
      return NextResponse.json({ error: 'Simulation grading is temporarily unavailable.' }, { status: 503, headers });
    }
  });
}
