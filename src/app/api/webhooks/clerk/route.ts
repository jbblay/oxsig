import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { processClerkWebhookEvent, type ClerkWebhookEvent } from '@/lib/auth/clerk-webhook';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let event: ClerkWebhookEvent;
  try {
    event = (await verifyWebhook(request)) as unknown as ClerkWebhookEvent;
  } catch (error) {
    // Signature/format failures are permanent: 400 tells Svix not to retry.
    console.error('Clerk webhook verification failed:', error);
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }

  try {
    const outcome = await processClerkWebhookEvent(event, request.headers.get('svix-id'));
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    // Processing failures (e.g. database unavailable) are transient: 500 lets
    // Svix retry with backoff instead of silently dropping the event.
    console.error('Clerk webhook processing failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
