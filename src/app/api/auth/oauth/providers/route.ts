import { NextResponse } from "next/server";
import { getOAuthConfig } from "@/lib/auth/oauth";

export async function GET() {
  return NextResponse.json({
    providers: (["google", "github"] as const).filter((provider) => Boolean(getOAuthConfig(provider))),
  });
}
