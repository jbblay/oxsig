import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import {
  AccessPathReadinessEvidenceConflictError,
  getAccessPathReadinessEvidence,
  recordAccessPathReadinessEvidence,
} from '@/lib/execution-evidence/access-path-readiness';
import { getGuestServiceReadinessEvidence } from '@/lib/execution-evidence/guest-service-readiness';
import { getRuntimeReadinessEvidence } from '@/lib/execution-evidence/runtime-readiness';
import {
  accessPathReadinessPayloadSchema,
  browserAccessObservationSchema,
  buildAccessPathReadinessFacts,
  buildAccessPathReadinessPayload,
  AccessPathReadinessInterpretationError,
} from '@/lib/infrastructure/access-path-readiness-evidence';
import { getDeploymentAuthorizationById } from '@/lib/infrastructure/deployment-authorization';
import {
  buildGuestServiceReadinessFacts,
  guestServiceReadinessPayloadSchema,
} from '@/lib/infrastructure/guest-service-readiness-evidence';
import { buildRuntimeReadinessFacts } from '@/lib/infrastructure/runtime-readiness-evidence';
import { verifyDesktopAccessEvidenceTicket } from '@/lib/labs/desktop-access-evidence-ticket';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const reportSchema = z.object({
  ticket: z.string().min(40).max(16_384),
  observation: browserAccessObservationSchema,
}).strict();

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

async function reconstructFacts(ownerId: string, labInstanceId: string, evidenceId?: string) {
  const evidence = await getAccessPathReadinessEvidence({ ownerId, labInstanceId, evidenceId });
  const authorization = await getDeploymentAuthorizationById(ownerId, evidence.deploymentAuthorizationId);
  if (!authorization) {
    throw new AccessPathReadinessEvidenceConflictError(
      'Deployment authorization for access-path evidence was not found.',
      'DEPLOYMENT_AUTHORIZATION_NOT_FOUND'
    );
  }

  const accessPayload = accessPathReadinessPayloadSchema.parse(evidence.payload);
  const guestEvidence = await getGuestServiceReadinessEvidence({
    ownerId,
    labInstanceId,
    evidenceId: accessPayload.prerequisiteGuestEvidenceId,
  });
  const guestPayload = guestServiceReadinessPayloadSchema.parse(guestEvidence.payload);
  const runtimeEvidence = await getRuntimeReadinessEvidence({
    ownerId,
    labInstanceId,
    evidenceId: guestPayload.prerequisiteRuntimeEvidenceId,
  });
  const runtimeFacts = buildRuntimeReadinessFacts({ authorization, evidence: runtimeEvidence });
  const guestFacts = buildGuestServiceReadinessFacts({ authorization, runtimeFacts, evidence: guestEvidence });
  const facts = buildAccessPathReadinessFacts({ authorization, guestFacts, evidence });

  return { evidence, authorization, facts };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return json({ error: 'Invalid or missing CSRF token', code: 'CSRF_FAILED' }, 403);
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = reportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: 'Invalid browser desktop access observation', code: 'ACCESS_PATH_REPORT_INVALID' }, 400);
    }

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
      return json({ error: 'Access-path evidence applies only to desktop labs.', code: 'ACCESS_PATH_NOT_APPLICABLE' }, 409);
    }

    let ticket;
    try {
      ticket = verifyDesktopAccessEvidenceTicket(parsed.data.ticket);
    } catch (error) {
      return json({
        error: error instanceof Error ? error.message : 'Invalid desktop access evidence ticket',
        code: 'ACCESS_PATH_TICKET_INVALID',
      }, 401);
    }

    if (ticket.ownerId !== user.id || ticket.labInstanceId !== id) {
      return json({ error: 'Desktop access evidence ticket does not belong to this lab.', code: 'ACCESS_PATH_TICKET_OWNER_MISMATCH' }, 403);
    }
    if (
      ticket.target !== lab.runtime_external_id ||
      ticket.platform !== lab.metadata?.platform ||
      (ticket.platform === 'linux' ? ticket.port !== 5901 : ticket.port !== 5900)
    ) {
      return json({ error: 'Desktop access evidence ticket does not match the active runtime.', code: 'ACCESS_PATH_TICKET_RUNTIME_MISMATCH' }, 409);
    }

    try {
      const authorization = await getDeploymentAuthorizationById(user.id, ticket.deploymentAuthorizationId);
      if (!authorization || !['evidence_recorded', 'analyzed'].includes(authorization.state)) {
        return json({ error: 'Deployment authorization is not ready for access-path evidence.', code: 'DEPLOYMENT_AUTHORIZATION_NOT_READY' }, 409);
      }
      const guestEvidence = await getGuestServiceReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        evidenceId: ticket.prerequisiteGuestEvidenceId,
      });
      const payload = buildAccessPathReadinessPayload({
        authorization,
        guestEvidence,
        ticket,
        observation: parsed.data.observation,
      });
      const evidence = await recordAccessPathReadinessEvidence({
        ownerId: user.id,
        labInstanceId: id,
        deploymentAuthorizationId: authorization.id,
        executionId: ticket.evidenceExecutionId,
        payload,
      });

      return json({
        evidence: {
          id: evidence.id,
          executionId: evidence.executionId,
          provenance: evidence.provenance,
          state: evidence.state,
          recordedAt: evidence.evidenceRecordedAt,
        },
        readiness: payload.readiness,
      }, evidence.state === 'evidence_recorded' ? 201 : 200);
    } catch (error) {
      if (
        error instanceof AccessPathReadinessEvidenceConflictError ||
        error instanceof AccessPathReadinessInterpretationError
      ) {
        return json({ error: error.message, code: error.code }, 409);
      }
      console.error('Access-path evidence capture failed:', error);
      return json({
        error: error instanceof Error ? error.message : 'Could not record browser desktop access-path evidence',
        code: 'ACCESS_PATH_CAPTURE_FAILED',
      }, 503);
    }
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 40, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;
    const { id } = await context.params;

    try {
      const { evidence, authorization, facts } = await reconstructFacts(user.id, id);
      return json({
        evidence: {
          id: evidence.id,
          executionId: evidence.executionId,
          provenance: evidence.provenance,
          state: evidence.state,
          recordedAt: evidence.evidenceRecordedAt,
          ...(evidence.analysis ? { analysis: evidence.analysis } : {}),
          ...(evidence.model ? { model: evidence.model } : {}),
        },
        authorization: {
          id: authorization.id,
          planId: authorization.planId,
          state: authorization.state,
        },
        facts,
      });
    } catch (error) {
      if (
        error instanceof AccessPathReadinessEvidenceConflictError ||
        error instanceof AccessPathReadinessInterpretationError
      ) {
        const status = error.code === 'ACCESS_PATH_EVIDENCE_NOT_FOUND' ? 404 : 409;
        return json({ error: error.message, code: error.code }, status);
      }
      console.error('Access-path evidence read failed:', error);
      return json({ error: 'Could not read access-path evidence', code: 'ACCESS_PATH_READ_FAILED' }, 503);
    }
  });
}
