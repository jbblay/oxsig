import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { deactivateClerkUser, upsertClerkUser } from '@/lib/auth/clerk-user';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const event = await verifyWebhook(request);

    if (event.type === 'user.created' || event.type === 'user.updated') {
      const user = event.data;
      const primaryEmail =
        user.email_addresses.find((address) => address.id === user.primary_email_address_id) ||
        user.email_addresses[0];
      const displayName =
        [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
        user.username ||
        null;

      await upsertClerkUser({
        clerkUserId: user.id,
        email: primaryEmail?.email_address || null,
        emailVerified: primaryEmail?.verification?.status === 'verified',
        displayName,
        avatarUrl: user.image_url || null,
      });
    } else if (event.type === 'user.deleted' && event.data.id) {
      await deactivateClerkUser(event.data.id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Clerk webhook verification/sync failed:', error);
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }
}
