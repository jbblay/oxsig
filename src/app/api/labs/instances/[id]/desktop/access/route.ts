import { randomBytes } from 'node:crypto';
import { DeleteParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { awsClientConfig } from '@/lib/aws/client-config';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import { executeLabCommand } from '@/lib/labs/aws-runtime';
import { getLabTerminalDiagnostics } from '@/lib/labs/terminal-observability';
import { getRequestMetadata, logAudit } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const ssm = new SSMClient(awsClientConfig(REGION));

const idSchema = z.string().uuid();
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };
const UNDELIVERABLE = new Set(['Undeliverable', 'DeliveryTimedOut', 'Delivery Timed Out', 'Delivery Failed']);

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

// Windows guest credentials are issued only after the owner's authenticated
// browser desktop is ready. A new request rotates the previous guest password.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) return reply({ error: 'Invalid or missing CSRF token' }, 403);
    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) return reply({ error: 'Invalid lab instance' }, 400);
    const limited = await checkRateLimit(req, { maxRequests: 5, windowMs: 60 * 60_000 }, user.id, 'windows-desktop-access');
    if (limited) return limited;

    const result = await getPool().query(
      `SELECT status,runtime_provider,runtime_external_id,expires_at,metadata
         FROM lab_instances WHERE id=$1 AND owner_id=$2 LIMIT 1`,
      [id, user.id]
    );
    const lab = result.rows[0];
    if (!lab) return reply({ error: 'Lab instance not found' }, 404);
    if (lab.metadata?.operationRunId || lab.metadata?.managedByOperation) {
      return reply({ error: 'Operation credentials are provided in the Operation workspace' }, 409);
    }
    if (lab.metadata?.platform !== 'windows' || lab.metadata?.accessMode !== 'desktop') {
      return reply({ error: 'This lab does not use Windows desktop access' }, 409);
    }
    if (lab.status !== 'running' || lab.runtime_provider !== 'aws-ec2' || !lab.runtime_external_id) {
      return reply({ error: 'The Windows desktop is not running' }, 409);
    }
    if (lab.expires_at && new Date(lab.expires_at).getTime() <= Date.now()) {
      return reply({ error: 'This lab has expired' }, 410);
    }

    // SSM Run Command can accept a command even when the guest is offline.
    // Fail before generating/storing any secret unless the owned EC2 instance
    // is running and the agent is registered and reporting Online.
    try {
      const diagnostics = await getLabTerminalDiagnostics(lab.runtime_external_id);
      if (diagnostics.ec2State !== 'running') {
        return reply({ code: 'EC2_NOT_RUNNING', error: 'The Windows lab machine is not running. Start the lab and retry.' }, 409);
      }
      if (!diagnostics.instanceProfileConfigured || !diagnostics.ssmRegistered || diagnostics.ssmPingStatus !== 'Online') {
        return reply({ code: 'SSM_NOT_READY', error: 'Windows is starting or its SSM agent is offline. Wait for SSM Online in Diagnostics, then retry.' }, 503);
      }
      if (diagnostics.platformType && diagnostics.platformType !== 'Windows') {
        return reply({ code: 'DESKTOP_PLATFORM_MISMATCH', error: 'The machine does not match the selected Windows desktop.' }, 409);
      }
    } catch {
      return reply({ code: 'DESKTOP_DIAGNOSTICS_FAILED', error: 'Could not verify machine readiness. Please retry shortly.' }, 503);
    }

    // ASCII keys work reliably through the browser's RFB keyboard bridge.
    // The fixed prefix satisfies Windows complexity requirements; the random
    // suffix makes the password unique to this issuance.
    const password = `Ox!7${randomBytes(20).toString('hex')}`;
    // Run Command inputs are logged by AWS. Send only an unpredictable
    // Parameter Store name; the instance retrieves the encrypted value itself.
    const parameterName = `/oxsig/desktop-access/${randomBytes(20).toString('hex')}`;
    // A late SSM command must not rotate the guest password after the request has timed out.
    const commandDeadline = Date.now() + 75_000;
    const command = `$ErrorActionPreference='Stop';$secret=(Get-SSMParameter -Name '${parameterName}' -WithDecryption $true -Region '${REGION}').Value;if(-not $secret){throw 'Desktop secret unavailable'};$account=Get-LocalUser|Where-Object {$_.SID.Value -like '*-500'}|Select-Object -First 1;if(-not $account){throw 'Local administrator missing'};if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt ${commandDeadline}){throw 'Desktop request expired'};Set-LocalUser -Name $account.Name -Password (ConvertTo-SecureString $secret -AsPlainText -Force);Enable-LocalUser -Name $account.Name;Write-Output ('OXSIG_USER='+$account.Name)`;

    let parameterCreated = false;
    let commandSettled = false;
    try {
      await ssm.send(new PutParameterCommand({
        Name: parameterName,
        Value: password,
        Type: 'SecureString',
        Tier: 'Advanced',
        Policies: JSON.stringify([{
          Type: 'Expiration',
          Version: '1.0',
          Attributes: { Timestamp: new Date(Date.now() + 15 * 60_000).toISOString() },
        }]),
        Overwrite: false,
      }));
      parameterCreated = true;
      const invocation = await executeLabCommand(lab.runtime_external_id, command, 'windows', { maxAttempts: 115 });
      commandSettled = true;
      const username = invocation.stdout.split(/\r?\n/).find((line) => line.startsWith('OXSIG_USER='))?.slice('OXSIG_USER='.length).trim();
      if (UNDELIVERABLE.has(invocation.statusDetails)) {
        return reply({ code: 'SSM_NOT_READY', error: 'The Windows machine did not receive the login command. Wait for SSM Online in Diagnostics, then retry.' }, 503);
      }
      if (invocation.status !== 'Success' || invocation.exitCode !== 0 || !username) {
        // Never return SSM stdout/stderr, which may contain guest details.
        return reply({ code: 'DESKTOP_LOGIN_GUEST_FAILED', error: 'Windows could not set the login password. Check guest readiness and try again.' }, 503);
      }
      await logAudit({
        userId: user.id,
        action: 'lab.desktop.access.issue',
        resourceType: 'lab',
        resourceId: id,
        ...getRequestMetadata(req),
        metadata: { provider: 'aws-ssm', platform: 'windows' },
      });
      return reply({ username, password });
    } catch (error) {
      console.error('Windows desktop credential issuance failed', {
        labInstanceId: id,
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return reply({
        code: 'DESKTOP_LOGIN_FAILED',
        error: 'Windows login could not be prepared. Check SSM readiness in Diagnostics and try again.',
      }, 503);
    } finally {
      // When polling times out, SSM may still be reading the parameter. Let the
      // 15-minute Parameter Store expiration clean it up instead of racing the VM.
      if (parameterCreated && commandSettled) {
        await ssm.send(new DeleteParameterCommand({ Name: parameterName })).catch((error) => {
          console.error('Windows desktop secret cleanup failed', {
            labInstanceId: id,
            reason: error instanceof Error ? error.name : 'unknown',
          });
        });
      }
    }
  });
}
