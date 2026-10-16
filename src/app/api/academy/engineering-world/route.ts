import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { validateCsrfToken } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { engineCommandSchema } from "@/lib/academy/mission-engine-policy";
import {
  engineeringWorld,
  flightRecorder,
  commandMission,
} from "@/lib/academy/mission-engine";
import { MissionControlError } from "@/lib/academy/mission-control";
const headers = { "Cache-Control": "no-store" };
export const dynamic = "force-dynamic";
function errorResponse(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof MissionControlError
          ? error.message
          : "Engineering World is unavailable.",
    },
    {
      status: error instanceof MissionControlError ? error.status : 503,
      headers,
    },
  );
}
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const id = req.nextUrl.searchParams.get("run");
      if (id && !/^[a-f0-9-]{36}$/i.test(id))
        return NextResponse.json(
          { error: "Invalid run" },
          { status: 400, headers },
        );
      return NextResponse.json(
        id
          ? await flightRecorder(user.id, id)
          : await engineeringWorld(user.id),
        { headers },
      );
    } catch (e) {
      return errorResponse(e);
    }
  });
}
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req)))
      return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403, headers },
      );
    const limited = await checkRateLimit(
      req,
      { maxRequests: 60, windowMs: 3600000, failClosed: true },
      user.id,
      "engineering-world",
    );
    if (limited) return limited;
    const parsed = engineCommandSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400, headers },
      );
    try {
      return NextResponse.json(await commandMission(user.id, parsed.data), {
        headers,
      });
    } catch (e) {
      return errorResponse(e);
    }
  });
}
