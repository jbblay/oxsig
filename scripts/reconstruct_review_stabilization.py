from pathlib import Path
import re


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact match, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))
    print(f"patched {path}")


def replace_regex(path, pattern, replacement, flags=re.S):
    text = read(path)
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:100]!r}")
    write(path, new)
    print(f"patched {path}")


# EC2 API idempotency: retries of the same durable allocation must not create another VM.
replace_once(
    'src/lib/labs/aws-runtime.ts',
    "  const response = await ec2.send(new RunInstancesCommand({\n    ImageId: imageId,",
    "  const response = await ec2.send(new RunInstancesCommand({\n    ClientToken: `oxsig-lab-${instanceId}`,\n    ImageId: imageId,",
)
replace_once(
    'src/lib/operations/runtime.ts',
    "  const response = await ec2.send(new RunInstancesCommand({\n    ImageId: args.imageId,",
    "  const response = await ec2.send(new RunInstancesCommand({\n    ClientToken: `oxsig-op-${args.nodeId}`,\n    ImageId: args.imageId,",
)

# Operation pause/resume: atomically claim lifecycle transitions before touching AWS.
lifecycle_path = 'src/lib/operations/lifecycle.ts'
lifecycle_text = read(lifecycle_path)
prefix = lifecycle_text[:lifecycle_text.index('export async function pauseOperationRun')]
new_functions = r'''export async function pauseOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const run = await getOwnedRun(args.pool, args.runId, args.ownerId);
  if (['destroying', 'destroyed', 'failed'].includes(run.status)) {
    throw new OperationLifecycleError('This Operation cannot be paused in its current state.', 409, 'OPERATION_NOT_PAUSABLE');
  }
  if (run.metadata?.lifecycleState === 'paused') {
    return { paused: true, alreadyPaused: true, stopping: 0 };
  }
  if (run.status !== 'running') {
    throw new OperationLifecycleError('Wait until the Operation is ready before pausing it, or use End & destroy to terminate it now.', 409, 'OPERATION_NOT_READY_TO_PAUSE');
  }

  const ids = await getRuntimeIds(args.pool, args.runId);
  if (!ids.length) throw new OperationLifecycleError('The Operation has no EC2 runtimes to pause.', 409, 'OPERATION_RUNTIME_MISSING');
  const states = await getEc2States(ids);
  const runningIds = ids.filter((id) => states.get(id) === 'running');
  if (runningIds.length !== ids.length) {
    throw new OperationLifecycleError('All Operation machines must be running before the environment can be paused safely.', 409, 'OPERATION_NODES_NOT_RUNNING');
  }

  const claimed = await args.pool.query(
    `UPDATE operation_runs
        SET metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lifecycleState}', '"pausing"'::jsonb, true),
            updated_at=NOW()
      WHERE id=$1 AND owner_id=$2 AND status='running'
        AND COALESCE(metadata->>'lifecycleState', 'active')='active'
      RETURNING id`,
    [args.runId, args.ownerId]
  );
  if (!claimed.rowCount) {
    throw new OperationLifecycleError('Another lifecycle change is already in progress for this Operation.', 409, 'OPERATION_LIFECYCLE_BUSY');
  }

  try {
    await ec2.send(new StopInstancesCommand({ InstanceIds: runningIds }));
    await inTransaction(args.pool, async (client) => {
      const updated = await client.query(
        `UPDATE operation_runs
            SET status='provisioning',
                metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lifecycleState}', '"paused"'::jsonb, true),
                updated_at=NOW()
          WHERE id=$1 AND owner_id=$2 AND metadata->>'lifecycleState'='pausing'
          RETURNING id`,
        [args.runId, args.ownerId]
      );
      if (!updated.rowCount) {
        throw new OperationLifecycleError('The Operation lifecycle changed while pause was in progress.', 409, 'OPERATION_LIFECYCLE_CONFLICT');
      }
      await client.query(
        `UPDATE operation_nodes
            SET status='provisioning', updated_at=NOW()
          WHERE run_id=$1 AND status NOT IN ('destroying','destroyed','failed')`,
        [args.runId]
      );
      if (run.operator_lab_instance_id) {
        await client.query(
          `UPDATE lab_instances
              SET status='stopping', updated_at=NOW()
            WHERE id=$1 AND owner_id=$2 AND status NOT IN ('destroying','destroyed','failed')`,
          [run.operator_lab_instance_id, args.ownerId]
        );
      }
    });
  } catch (error) {
    await ec2.send(new StartInstancesCommand({ InstanceIds: runningIds })).catch(() => undefined);
    await args.pool.query(
      `UPDATE operation_runs
          SET metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lifecycleState}', '"active"'::jsonb, true), updated_at=NOW()
        WHERE id=$1 AND owner_id=$2 AND metadata->>'lifecycleState'='pausing'`,
      [args.runId, args.ownerId]
    ).catch(() => undefined);
    throw error;
  }

  return { paused: true, alreadyPaused: false, stopping: runningIds.length };
}

export async function resumeOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const run = await getOwnedRun(args.pool, args.runId, args.ownerId);
  if (['destroying', 'destroyed', 'failed'].includes(run.status)) {
    throw new OperationLifecycleError('This Operation cannot be resumed in its current state.', 409, 'OPERATION_NOT_RESUMABLE');
  }
  if (new Date(run.expires_at).getTime() <= Date.now()) {
    throw new OperationLifecycleError('This Operation has expired and cannot be resumed.', 410, 'OPERATION_EXPIRED');
  }
  if (run.metadata?.lifecycleState !== 'paused') {
    throw new OperationLifecycleError('This Operation is not paused.', 409, 'OPERATION_NOT_PAUSED');
  }

  const ids = await getRuntimeIds(args.pool, args.runId);
  if (!ids.length) throw new OperationLifecycleError('The Operation has no EC2 runtimes to resume.', 409, 'OPERATION_RUNTIME_MISSING');
  const states = await getEc2States(ids);
  const stoppedIds = ids.filter((id) => states.get(id) === 'stopped');
  if (stoppedIds.length !== ids.length) {
    throw new OperationLifecycleError('The Operation is still stopping. Wait until all machines are stopped, then resume.', 409, 'OPERATION_NODES_NOT_STOPPED');
  }

  const claimed = await args.pool.query(
    `UPDATE operation_runs
        SET metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lifecycleState}', '"resuming"'::jsonb, true),
            updated_at=NOW()
      WHERE id=$1 AND owner_id=$2
        AND metadata->>'lifecycleState'='paused'
        AND status NOT IN ('destroying','destroyed','failed')
      RETURNING id`,
    [args.runId, args.ownerId]
  );
  if (!claimed.rowCount) {
    throw new OperationLifecycleError('Another lifecycle change is already in progress for this Operation.', 409, 'OPERATION_LIFECYCLE_BUSY');
  }

  try {
    await ec2.send(new StartInstancesCommand({ InstanceIds: stoppedIds }));
    await inTransaction(args.pool, async (client) => {
      const updated = await client.query(
        `UPDATE operation_runs
            SET status='provisioning',
                metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lifecycleState}', '"active"'::jsonb, true),
                last_error=NULL,
                updated_at=NOW()
          WHERE id=$1 AND owner_id=$2 AND metadata->>'lifecycleState'='resuming'
          RETURNING id`,
        [args.runId, args.ownerId]
      );
      if (!updated.rowCount) {
        throw new OperationLifecycleError('The Operation lifecycle changed while resume was in progress.', 409, 'OPERATION_LIFECYCLE_CONFLICT');
      }
      await client.query(
        `UPDATE operation_nodes
            SET status='provisioning',
                metadata=metadata - 'bootstrapReadyAt' - 'readinessCheckedAt' - 'readinessReason' - 'readinessCommandId' - 'readinessCommandStartedAt' - 'readinessError',
                last_error=NULL,
                updated_at=NOW()
          WHERE run_id=$1 AND status NOT IN ('destroying','destroyed','failed')`,
        [args.runId]
      );
      if (run.operator_lab_instance_id) {
        await client.query(
          `UPDATE lab_instances
              SET status='provisioning', last_error=NULL, updated_at=NOW()
            WHERE id=$1 AND owner_id=$2 AND status NOT IN ('destroying','destroyed','failed')`,
          [run.operator_lab_instance_id, args.ownerId]
        );
      }
    });
  } catch (error) {
    await ec2.send(new StopInstancesCommand({ InstanceIds: stoppedIds })).catch(() => undefined);
    await args.pool.query(
      `UPDATE operation_runs
          SET metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lifecycleState}', '"paused"'::jsonb, true), updated_at=NOW()
        WHERE id=$1 AND owner_id=$2 AND metadata->>'lifecycleState'='resuming'`,
      [args.runId, args.ownerId]
    ).catch(() => undefined);
    throw error;
  }

  return { resumed: true, starting: stoppedIds.length };
}
'''
write(lifecycle_path, prefix + new_functions)
print(f"patched {lifecycle_path}")

# Unknown commands are not automatically trusted as read-only. Only a constrained
# inspection command grammar can bypass the changes-system approval path.
replace_once(
    'src/lib/ai-practitioner/server.ts',
    "const mutatingPattern = /(?:^|\\s)(?:apt(?:-get)?|dnf|yum|rpm|dpkg|pip|pip3|npm|pnpm|systemctl|service|useradd|userdel|usermod|groupadd|groupdel|chmod|chown|setfacl|firewall-cmd|ufw|iptables|nft|mount|umount|mkdir|touch|cp|mv|tee|sed\\s+-i)\\b|(?:^|\\s)(?:echo|printf)\\b[^\\n]*>/i;\n\nexport function classifyPractitionerCommand(command: string): AiPractitionerRisk {\n  return mutatingPattern.test(command) ? 'changes-system' : 'read-only';\n}",
    "const mutatingPattern = /(?:^|\\s)(?:apt(?:-get)?|dnf|yum|rpm|dpkg|pip|pip3|npm|pnpm|systemctl|service|useradd|userdel|usermod|groupadd|groupdel|chmod|chown|setfacl|firewall-cmd|ufw|iptables|nft|mount|umount|mkdir|touch|cp|mv|tee|sed\\s+-i)\\b|(?:^|\\s)(?:echo|printf)\\b[^\\n]*>/i;\nconst readOnlyCommandPattern = /^(?:sudo\\s+)?(?:ls|pwd|whoami|id|groups|uname|hostname|date|env|printenv|cat|head|tail|less|more|grep|egrep|fgrep|awk|cut|sort|uniq|wc|tr|stat|file|find|ps|pgrep|ss|netstat|ip|ifconfig|route|df|du|free|uptime|journalctl|dmesg|getent|dig|host|nslookup|ping|traceroute|tracepath|nmap)(?:\\s|$)/i;\nconst readOnlySystemctlPattern = /^(?:sudo\\s+)?systemctl\\s+(?:status|show|is-active|is-enabled|list-units|list-unit-files)(?:\\s|$)/i;\nconst readOnlyServicePattern = /^(?:sudo\\s+)?service\\s+[^\\s]+\\s+status(?:\\s|$)/i;\n\nfunction isRestrictedReadOnlyCommand(command: string) {\n  if (/[><`]|\\$\\(|\\r|\\n/.test(command)) return false;\n  const segments = command.split(/\\s*(?:&&|\\|\\||;|\\|)\\s*/).map((segment) => segment.trim()).filter(Boolean);\n  return segments.length > 0 && segments.every((segment) =>\n    readOnlyCommandPattern.test(segment) || readOnlySystemctlPattern.test(segment) || readOnlyServicePattern.test(segment)\n  );\n}\n\nexport function classifyPractitionerCommand(command: string): AiPractitionerRisk {\n  if (mutatingPattern.test(command)) return 'changes-system';\n  return isRestrictedReadOnlyCommand(command) ? 'read-only' : 'changes-system';\n}\n",
)

# Clerk: never reactivate an inactive local account and make first-login linking race-safe.
replace_once('src/lib/auth/clerk-user.ts', "const USER_COLUMNS = `id, public_key, email, display_name, role, clerk_user_id`;", "const USER_COLUMNS = `id, public_key, email, display_name, role, clerk_user_id, is_active`;")
replace_once(
    'src/lib/auth/clerk-user.ts',
    "  if (existing.rows[0]) {\n    const updated = await pool.query(",
    "  if (existing.rows[0] && existing.rows[0].is_active !== true) {\n    throw new Error('Clerk account is inactive.');\n  }\n\n  if (existing.rows[0]) {\n    const updated = await pool.query(",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "           auth_provider = 'clerk',\n           is_active = true,\n           clerk_deleted_at = NULL,\n           clerk_synced_at = NOW(),",
    "           auth_provider = 'clerk',\n           clerk_synced_at = NOW(),",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "       WHERE clerk_user_id = $1\n       RETURNING ${USER_COLUMNS}`",
    "       WHERE clerk_user_id = $1 AND is_active = true\n       RETURNING ${USER_COLUMNS}`",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "         WHERE id = $5\n         RETURNING ${USER_COLUMNS}`",
    "         WHERE id = $5 AND clerk_user_id IS NULL AND is_active = true\n         RETURNING ${USER_COLUMNS}`",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "      return mapRow(linked.rows[0]);",
    "      if (linked.rows[0]) return mapRow(linked.rows[0]);",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "     VALUES ($1, $2, $3, $4, $5, 'clerk', true, NOW(), NOW(), NOW())\n     RETURNING ${USER_COLUMNS}`",
    "     VALUES ($1, $2, $3, $4, $5, 'clerk', true, NOW(), NOW(), NOW())\n     ON CONFLICT (clerk_user_id) WHERE clerk_user_id IS NOT NULL DO NOTHING\n     RETURNING ${USER_COLUMNS}`",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "  return mapRow(created.rows[0]);\n}",
    "  if (created.rows[0]) return mapRow(created.rows[0]);\n\n  const raced = await pool.query(\n    `SELECT ${USER_COLUMNS} FROM users WHERE clerk_user_id=$1 AND is_active=true LIMIT 1`,\n    [snapshot.clerkUserId]\n  );\n  if (raced.rows[0]) return mapRow(raced.rows[0]);\n  throw new Error('Clerk account could not be linked safely.');\n}\n",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "  if (mapped.rows[0]) {",
    "  if (mapped.rows[0]) {",
)
replace_once(
    'src/lib/auth/clerk-user.ts',
    "  const clerkUser = await currentUser();",
    "  const inactive = await getPool().query(\n    `SELECT 1 FROM users WHERE clerk_user_id=$1 AND is_active=false LIMIT 1`,\n    [session.userId]\n  );\n  if (inactive.rows[0]) return null;\n\n  const clerkUser = await currentUser();",
)

# Separate trusted server events from browser-publishable ephemeral signals.
replace_once(
    'src/lib/realtime/channel-names.ts',
    "export function storyboardChannelName(storyboardId: string) {\n  return `oxsig:board:${storyboardId}`;\n}\n",
    "export function collaborationSignalChannelName(collaborationId: string) {\n  return `oxsig:collaboration:${collaborationId}:signals`;\n}\n\nexport function storyboardChannelName(storyboardId: string) {\n  return `oxsig:board:${storyboardId}`;\n}\n\nexport function storyboardSignalChannelName(storyboardId: string) {\n  return `oxsig:board:${storyboardId}:signals`;\n}\n",
)
replace_once(
    'src/lib/realtime/ably.ts',
    "  collaborationChannelName,\n  liveTerminalChannelName,\n  storyboardChannelName,",
    "  collaborationChannelName,\n  collaborationSignalChannelName,\n  liveTerminalChannelName,\n  storyboardChannelName,\n  storyboardSignalChannelName,",
)
replace_once(
    'src/lib/realtime/ably.ts',
    "  const channelName = collaborationChannelName(args.collaborationId);\n  return client.auth.requestToken({\n    clientId: args.clientId,\n    ttl: TOKEN_TTL_MS,\n    capability: {\n      [channelName]: ['subscribe', 'publish', 'presence'],\n    },\n  });",
    "  const channelName = collaborationChannelName(args.collaborationId);\n  const signalChannelName = collaborationSignalChannelName(args.collaborationId);\n  return client.auth.requestToken({\n    clientId: args.clientId,\n    ttl: TOKEN_TTL_MS,\n    capability: {\n      [channelName]: ['subscribe'],\n      [signalChannelName]: ['subscribe', 'publish', 'presence'],\n    },\n  });",
)
replace_once(
    'src/lib/realtime/ably.ts',
    "  const channelName = storyboardChannelName(args.storyboardId);\n  return client.auth.requestToken({\n    clientId: args.clientId,\n    ttl: TOKEN_TTL_MS,\n    capability: {\n      [channelName]: ['subscribe', 'publish', 'presence'],\n    },\n  });",
    "  const channelName = storyboardChannelName(args.storyboardId);\n  const signalChannelName = storyboardSignalChannelName(args.storyboardId);\n  return client.auth.requestToken({\n    clientId: args.clientId,\n    ttl: TOKEN_TTL_MS,\n    capability: {\n      [channelName]: ['subscribe'],\n      [signalChannelName]: ['subscribe', 'publish', 'presence'],\n    },\n  });",
)

# Collaboration browser: server event channel is subscribe-only; typing/presence use signals.
replace_once('src/lib/collab/use-realtime.ts', "    let channel: RealtimeChannel | null = null;", "    let channel: RealtimeChannel | null = null;\n    let signalChannel: RealtimeChannel | null = null;")
replace_once('src/lib/collab/use-realtime.ts', "      if (!channel || disposed) return;", "      if (!signalChannel || disposed) return;")
replace_once('src/lib/collab/use-realtime.ts', "        await channel.publish(typing ? 'typing.started' : 'typing.stopped', { surface: 'collaboration' });", "        await signalChannel.publish(typing ? 'typing.started' : 'typing.stopped', { surface: 'collaboration' });")
replace_once('src/lib/collab/use-realtime.ts', "        channel = client.channels.get(`oxsig:collaboration:${collaborationId}`);", "        channel = client.channels.get(`oxsig:collaboration:${collaborationId}`);\n        signalChannel = client.channels.get(`oxsig:collaboration:${collaborationId}:signals`);")
replace_once('src/lib/collab/use-realtime.ts', "          if (!channel) return;\n          try {\n            const members = await channel.presence.get();", "          if (!signalChannel) return;\n          try {\n            const members = await signalChannel.presence.get();")
replace_once('src/lib/collab/use-realtime.ts', "        await channel.subscribe('typing.started', onTypingStarted);\n        await channel.subscribe('typing.stopped', onTypingStopped);\n        await channel.presence.subscribe(onPresence);\n        await channel.presence.enter({ surface: 'collaboration' });", "        await signalChannel.subscribe('typing.started', onTypingStarted);\n        await signalChannel.subscribe('typing.stopped', onTypingStopped);\n        await signalChannel.presence.subscribe(onPresence);\n        await signalChannel.presence.enter({ surface: 'collaboration' });")
replace_once('src/lib/collab/use-realtime.ts', "      if (channel) {\n        if (localTyping) void channel.publish('typing.stopped', { surface: 'collaboration' }).catch(() => undefined);\n        channel.unsubscribe();\n        channel.presence.unsubscribe();\n        void channel.presence.leave().catch(() => undefined);\n      }", "      if (channel) channel.unsubscribe();\n      if (signalChannel) {\n        if (localTyping) void signalChannel.publish('typing.stopped', { surface: 'collaboration' }).catch(() => undefined);\n        signalChannel.unsubscribe();\n        signalChannel.presence.unsubscribe();\n        void signalChannel.presence.leave().catch(() => undefined);\n      }")

# Storyboard browser: server event channel is subscribe-only; cursors/presence use signals.
replace_once('src/lib/storyboards/use-realtime.ts', "import { storyboardChannelName } from '@/lib/realtime/channel-names';", "import { storyboardChannelName, storyboardSignalChannelName } from '@/lib/realtime/channel-names';")
replace_once('src/lib/storyboards/use-realtime.ts', "    let channel: RealtimeChannel | null = null;", "    let channel: RealtimeChannel | null = null;\n    let signalChannel: RealtimeChannel | null = null;")
replace_once('src/lib/storyboards/use-realtime.ts', "      if (!channel) return;\n      try {\n        const members = await channel.presence.get()", "      if (!signalChannel) return;\n      try {\n        const members = await signalChannel.presence.get()")
replace_once('src/lib/storyboards/use-realtime.ts', "        channel = client.channels.get(storyboardChannelName(storyboardId));\n        channelRef.current = channel;", "        channel = client.channels.get(storyboardChannelName(storyboardId));\n        signalChannel = client.channels.get(storyboardSignalChannelName(storyboardId));\n        channelRef.current = signalChannel;")
replace_once('src/lib/storyboards/use-realtime.ts', "        await channel.subscribe('cursor.moved', updateCursor);", "        await signalChannel.subscribe('cursor.moved', updateCursor);")
replace_once('src/lib/storyboards/use-realtime.ts', "        await channel.presence.subscribe(() => void refreshPresence());\n        await channel.presence.enter({", "        await signalChannel.presence.subscribe(() => void refreshPresence());\n        await signalChannel.presence.enter({")
replace_once('src/lib/storyboards/use-realtime.ts', "      if (channel) {\n        channel.unsubscribe();\n        channel.presence.unsubscribe();\n        void channel.presence.leave().catch(() => undefined);\n      }", "      if (channel) channel.unsubscribe();\n      if (signalChannel) {\n        signalChannel.unsubscribe();\n        signalChannel.presence.unsubscribe();\n        void signalChannel.presence.leave().catch(() => undefined);\n      }")

# Lab expiry must gate every interactive/AI access route, not only command execution.
replace_once(
    'src/app/api/labs/instances/[id]/ai/execute/route.ts',
    "              instance.status,\n              instance.runtime_provider,",
    "              instance.status,\n              instance.expires_at,\n              instance.runtime_provider,",
)
replace_once(
    'src/app/api/labs/instances/[id]/ai/execute/route.ts',
    "    if (!instance) return NextResponse.json({ error: 'Lab instance not found' }, { status: 404 });\n    if (instance.status !== 'running') {",
    "    if (!instance) return NextResponse.json({ error: 'Lab instance not found' }, { status: 404 });\n    if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {\n      return NextResponse.json({ error: 'The Cyber Lab session has expired' }, { status: 410 });\n    }\n    if (instance.status !== 'running') {",
)
replace_once(
    'src/app/api/labs/instances/[id]/ai/terminal/route.ts',
    "    `SELECT instance.id, instance.status, instance.runtime_provider, instance.runtime_external_id,\n            definition.slug",
    "    `SELECT instance.id, instance.status, instance.expires_at, instance.runtime_provider, instance.runtime_external_id,\n            definition.slug",
)
replace_once(
    'src/app/api/labs/instances/[id]/ai/terminal/route.ts',
    "  if (!instance) return { error: 'Lab instance not found', status: 404 as const };\n  if (instance.status !== 'running') {",
    "  if (!instance) return { error: 'Lab instance not found', status: 404 as const };\n  if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {\n    return { error: 'The Cyber Lab session has expired', status: 410 as const };\n  }\n  if (instance.status !== 'running') {",
)
replace_once(
    'src/app/api/labs/instances/[id]/terminal/route.ts',
    "    if (!instance) {\n      return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');\n    }\n    if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {",
    "    if (!instance) {\n      return failure(404, 'LAB_NOT_FOUND', 'No Oxsig lab record exists for this account and lab ID.', 'database');\n    }\n    if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) {\n      return failure(410, 'LAB_EXPIRED', 'The lab session has expired.', 'expiry', instance);\n    }\n    if (instance.runtime_provider !== 'aws-ec2' || !instance.runtime_external_id) {",
)
# The same GET snippet appears before POST; only the first is intentionally replaced above.

# AI Practitioner plan/explain context should not treat an expired lab as runnable.
replace_once(
    'src/app/api/ai/practitioner/route.ts',
    "            instance.status,\n            instance.runtime_provider,",
    "            instance.status,\n            instance.expires_at,\n            instance.runtime_provider,",
)
replace_once(
    'src/app/api/ai/practitioner/route.ts',
    "  if (!instance) return { error: 'Lab instance not found', status: 404 as const };\n  if (instance.status !== 'running') return { error: 'AI Practitioner requires a running Cyber Lab machine for command execution', status: 409 as const };",
    "  if (!instance) return { error: 'Lab instance not found', status: 404 as const };\n  if (instance.expires_at && new Date(instance.expires_at).getTime() <= Date.now()) return { error: 'The Cyber Lab session has expired', status: 410 as const };\n  if (instance.status !== 'running') return { error: 'AI Practitioner requires a running Cyber Lab machine for command execution', status: 409 as const };",
)

# S3 listing follows continuation tokens while preserving the existing array response contract.
replace_once(
    'src/app/api/storage/list/route.ts',
    "      const result = await getStorageClient().send(\n        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: maxKeys })\n      );\n\n      const objects =\n        result.Contents?.map((object) => ({",
    "      const contents = [];\n      let continuationToken: string | undefined;\n      do {\n        const remaining = maxKeys - contents.length;\n        const result = await getStorageClient().send(\n          new ListObjectsV2Command({\n            Bucket: bucket,\n            Prefix: prefix,\n            MaxKeys: remaining,\n            ContinuationToken: continuationToken,\n          })\n        );\n        contents.push(...(result.Contents || []));\n        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;\n      } while (continuationToken && contents.length < maxKeys);\n\n      const objects = contents.map((object) => ({",
)
replace_once(
    'src/app/api/storage/list/route.ts',
    "          createdAt: object.LastModified?.toISOString() || '',\n        })) || [];",
    "          createdAt: object.LastModified?.toISOString() || '',\n        }));",
)

print('review stabilization reconstruction patches applied')
