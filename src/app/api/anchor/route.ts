import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { digest, chains = ["ICP", "Ethereum", "Polygon"] } = body ?? {};
  const eventId = `anchor-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  const anchors = chains.map((c: string) => ({
    chain: c,
    txId: `stub-${c.toLowerCase()}-${crypto.randomUUID()}`,
    timestamp,
  }));

  return NextResponse.json({
    eventId,
    type: "ANCHOR",
    timestamp,
    digest,
    anchors,
    message: "Anchoring simulated (stub). Connect to canisters and EVM RPCs for production.",
  });
}