import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createOxsigVoiceStream } from '@/lib/voice/server';

export const runtime = 'nodejs';

const requestSchema = z.object({
  text: z.string().trim().min(1).max(12000),
}).strict();

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid voice request' }, { status: 400 });
    }

    try {
      const providerResponse = await createOxsigVoiceStream(parsed.data.text);
      return new Response(providerResponse.body, {
        status: 200,
        headers: {
          'Content-Type': providerResponse.headers.get('content-type') || 'audio/mpeg',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice provider request failed';
      return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
    }
  });
}
