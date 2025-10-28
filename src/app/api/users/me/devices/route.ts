/**
 * User Devices API
 * GET /api/users/me/devices - Get user's paired devices
 * DELETE /api/users/me/devices - Delete a device
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const result = await getPool().query(
        `SELECT 
          id,
          device_pub_key,
          device_did,
          device_info,
          paired_at,
          last_seen,
          trusted
         FROM paired_devices
         WHERE user_did = $1
         ORDER BY last_seen DESC`,
        [`did:oxsig:${user.id}`]
      );

      const devices = result.rows.map((row: any) => {
        const deviceInfo = typeof row.device_info === 'string' 
          ? JSON.parse(row.device_info) 
          : row.device_info;

        return {
          id: row.id,
          name: deviceInfo?.name || 'Unknown Device',
          platform: deviceInfo?.platform || 'unknown',
          type: getDeviceType(deviceInfo?.platform),
          lastActive: formatLastActive(row.last_seen),
          trusted: row.trusted,
          pairedAt: row.paired_at,
          deviceDid: row.device_did
        };
      });

      return NextResponse.json({ devices });
    } catch (error) {
      console.error('Failed to get devices:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve devices' },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    try {
      const { searchParams } = new URL(req.url);
      const deviceId = searchParams.get('deviceId');

      if (!deviceId) {
        return NextResponse.json(
          { error: 'Device ID is required' },
          { status: 400 }
        );
      }

      // Verify device belongs to user
      const checkResult = await getPool().query(
        'SELECT id FROM paired_devices WHERE id = $1 AND user_did = $2',
        [deviceId, `did:oxsig:${user.id}`]
      );

      if (checkResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Device not found or unauthorized' },
          { status: 404 }
        );
      }

      // Delete device
      await getPool().query(
        'DELETE FROM paired_devices WHERE id = $1',
        [deviceId]
      );

      return NextResponse.json({ 
        success: true,
        message: 'Device removed successfully' 
      });
    } catch (error) {
      console.error('Failed to delete device:', error);
      return NextResponse.json(
        { error: 'Failed to delete device' },
        { status: 500 }
      );
    }
  });
}

function getDeviceType(platform?: string): 'laptop' | 'mobile' | 'tablet' | 'desktop' {
  if (!platform) return 'desktop';
  
  const p = platform.toLowerCase();
  if (p.includes('iphone') || p.includes('android')) return 'mobile';
  if (p.includes('ipad') || p.includes('tablet')) return 'tablet';
  if (p.includes('mac') || p.includes('windows') || p.includes('linux')) return 'laptop';
  
  return 'desktop';
}

function formatLastActive(lastSeen: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(lastSeen).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Active now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  return new Date(lastSeen).toLocaleDateString();
}
