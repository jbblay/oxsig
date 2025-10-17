import { NextResponse } from "next/server";

async function sha256(input: string) {
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    docId,
    signerDid,
    payloadHash,
    geoHash,
    behavioralMarkers = {},
    thresholdGroup = [],
    duress = false,
    zkProofRef,
  } = body ?? {};

  const eventId = `sig-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  const material = `${docId}|${signerDid}|${payloadHash}|${timestamp}|${geoHash || ""}`;
  const signature = await sha256(material);
  const decoySig = duress ? await sha256(material + "|DECOY") : null;

  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "SignatureEvent"],
    issuer: signerDid,
    issuanceDate: timestamp,
    credentialSubject: {
      id: docId,
      signerDid,
      geoHash,
      behavioralMarkers,
      thresholdGroup,
      zkProofRef,
    },
    proof: {
      type: "DataIntegrityProof",
      created: timestamp,
      proofPurpose: "assertionMethod",
      verificationMethod: `${signerDid}#keys-1`,
      digest: signature,
    },
  };

  return NextResponse.json({
    eventId,
    type: "SIGNATURE_CREATE",
    timestamp,
    docId,
    signerDid,
    signature,
    duress,
    decoySig,
    silentAlert: duress ? true : false,
    geoHash,
    behavioralMarkers,
    thresholdGroup,
    zkProofRef,
    verifiableCredential: vc,
    anchors: [], // anchor later via /api/anchor
    message: duress
      ? "Duress signature generated. Silent alert recorded; real content remains protected."
      : "Signature created successfully (stub). Integrate TEE & PQ schemes for production.",
  });
}