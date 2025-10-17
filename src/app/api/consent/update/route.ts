import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { actorDid, targetDid, documentId, action, policyRef, zkProofRef } = body ?? {};
  const eventId = `consent-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  return NextResponse.json({
    eventId,
    type: "CONSENT_UPDATE",
    timestamp,
    actorDid,
    targetDid,
    documentId,
    action, // "GRANT" | "REVOKE" | "UPDATE"
    policyRef,
    zkProofRef,
    anchors: [],
    message: "Consent ledger update accepted (stub). Wire to smart contracts for enforceable state.",
  });
}