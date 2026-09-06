import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { recordGuestServiceReadinessEvidence } from '@/lib/execution-evidence/guest-service-readiness';
import { getRuntimeReadinessEvidence } from '@/lib/execution-evidence/runtime-readiness';
import { getDeploymentAuthorizationById } from '@/lib/infrastructure/deployment-authorization';
import {
  buildGuestServiceReadinessFacts,
  buildGuestServiceReadinessPayload,
  GuestServiceReadinessInterpretationError,
} from '@/lib/infrastructure/guest-service-readiness-evidence';
import { buildRuntimeReadinessFacts } from '@/lib/infrastructure/runtime-readiness-evidence';
import { inspectDesktopService, type DesktopPlatform } from '@/lib/labs/desktop-runtime';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
};

type LabRow = {
  id: string;
  runtime_provider: string;
  runtime_external_id: string | null;
  expires_at: string | Date | null;
  metadata: Record<string, unknown> | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function getOwnedLab(id: string, ownerId: string): Promise<LabRow | null> {
  const result = await getPool().query(
    `SELECT id,runtime_provider,runtime_external_id,expires_at,metadata
       FROM lab_instances
      WHERE id=$1 AND owner_id=$2
      LIMIT 1`,
    [id, ownerId]
  );
  return result.rows[0] || null;
}

async function getBoundAuthorizationId(ownerId: string, labInstanceId: string) {
  const result = await getPool().query(
    `SELECT id
       FROM deployment_authorizations
      WHERE owner_id=$1
        AND lab_instance_id=$2
        AND state IN ('evidence_recorded','analyzed')
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId, labInstanceId]
  );
  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return json({ error: 'Invalid or missing CSRF token', code: 'CSRF_FAILED' }, 403);
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    const lab = await getOwnedLab(id, user.id);
    if (!lab) return json({ error: 'Lab not found', code: 'LAB_NOT_FOUND' }, 404);
    if (lab.expires_at && new Date(lab.expires_at).getTime() <= Date.now()) {
      return json({ error: 'The lab session has expired.', code: 'LAB_EXPIRED' }, 410);
    }
    if (lab.runtime_provider !== 'aws-ec2' || !lab.runtime_external_id) {
      return json({ error: 'The lab does not have an AWS EC2 runtime attached.', code: 'LAB_RUNTIME_MISSING' }, 409);
    }
    if (lab.metadata?.accessMode !== 'desktop') {
      return json({
        error: 'Guest desktop-service readiness applies only to desktop lab deployments.',
        code: 'GUEST_SERVICE_NOT_APPLICABLE',
      }, 409);
    }

    const rawPlatform = lab.metadata?.platform;
    if (rawPlatform !== 'linux' && rawPlatform !== 'windows') {
      return json({
        error: 'The controlled lab does not have a recognized guest platform binding.',
        code: 'GUEST_SERVICE_PLATFORM_UNKNOWN',
      }, 409);
    }
    const platform: DesktopPlatform = rawPlatform;

    const authorizationId = await getBoundAuthorizationId(user.id, id);
    if (!authorizationId) {
      return json({
        error: 'No completed controlled deployment authorization is bound to this lab.',
        code: 'DEPLOYMENT_AUTHORIZATION_NOT_READY',
      }, 409);
    }

    const authorization = await getDeploymentAuthorizationById(user.id, authorizationId);
    if (!authorization || !['evidence_recorded', 'analyzed'].includes(authorization.state)) {
      return json({
        error: 'The bound deployment authorization is not ready for guest-service evidence.',
        code: 'DEPLOYMENT_AUTHORIZATION_NOT_READY',
      }, 409);
    }

    try {
      const runtimeEvidence = await getRuntimeReadinessEvidence({ ownerId: user.id, labInstanceId: id });
      const runtimeFacts = buildRuntimeReadinessFacts({ authorization, evidence: runtimeEvidence });
      if (!runtimeFacts.readiness.managementReady) {
        return json({
          error: 'Runtime management must be ready before OXSIG can inspect the guest desktop service.',
          code: 'GUEST_SERVICE_MANAGEMENT_NOT_READY',
        }, 409);
      }

      const inspection = await inspectDesktopService(lab.runtime_external_id, platform);
      const payload = buildGuestServiceReadinessPayload({ authorization, runtimeFacts, inspection });
      const evidence = await recordGuestServiceReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        deploymentAuthorizationId: authorization.id,
        payload,
      });
      const facts = buildGuestServiceReadinessFacts({ authorization, runtimeFacts, evidence });

      return json({
        evidence: {
          id: evidence.id,
          executionId: evidence.executionId,
          provenance: evidence.provenance,
          state: evidence.state,
          recordedAt: evidence.evidenceRecordedAt,
        },
        authorization: {
          id: authorization.id,
          planId: authorization.planId,
          state: authorization.state,
        },
        facts,
      }, 201);
    } catch (error) {
      if (error instanceof GuestServiceReadinessInterpretationError) {
        return json({ error: error.message, code: error.code }, 409);
      }
      console.error('Guest-service readiness evidence capture failed:', error);
      return json({
        error: error instanceof Error ? error.message : 'Could not capture guest-service readiness evidence',
        code: 'GUEST_SERVICE_CAPTURE_FAILED',
      }, 503);
    }
  });
}
