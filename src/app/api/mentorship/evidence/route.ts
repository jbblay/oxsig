import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { validateCsrfToken } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { NO_STORE, mentorshipErrorResponse } from "@/lib/mentorship/http";
import {
  evidenceCommandSchema,
  FORGE_SCENARIO,
} from "@/lib/mentorship/evidence-policy";
import {
  commandEvidence,
  evidenceState,
  passportSummary,
} from "@/lib/mentorship/evidence";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      return NextResponse.json(
        {
          ...(await evidenceState(user.id)),
          passport: await passportSummary(user.id),
          scenario: FORGE_SCENARIO,
        },
        { headers: NO_STORE },
      );
    } catch (error) {
      return mentorshipErrorResponse(error, "Evidence");
    }
  });
}
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req)))
      return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403, headers: NO_STORE },
      );
    const limited = await checkRateLimit(
      req,
      { maxRequests: 20, windowMs: 3600000, failClosed: true },
      user.id,
      "mentor-evidence",
    );
    if (limited) return limited;
    const parsed = evidenceCommandSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400, headers: NO_STORE },
      );
    try {
      return NextResponse.json(await commandEvidence(user.id, parsed.data), {
        headers: NO_STORE,
      });
    } catch (error) {
      return mentorshipErrorResponse(error, "Evidence submission");
    }
  });
}
