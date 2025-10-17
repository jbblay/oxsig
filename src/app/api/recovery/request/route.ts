import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { lostDid, contacts = [], threshold = 2 } = body ?? {};
  const eventId = `recovery-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  const challenge = crypto.randomUUID();

  return NextResponse.json({
    eventId,
    type: "RECOVERY_REQUEST",
    timestamp,
    lostDid,
    contacts,
    threshold,
    challenge,
    message: "Recovery request created (stub). Implement social recovery contract flow.",
  });
}