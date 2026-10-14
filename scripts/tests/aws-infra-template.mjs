// Static validation of the AWS CloudFormation template (no AWS access needed).
//   node --test scripts/tests/aws-infra-template.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_SECRET_KEYS, template } from '../../infra/aws/template.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const PSEUDO = new Set(['AWS::Region', 'AWS::AccountId', 'AWS::Partition', 'AWS::StackName', 'AWS::StackId', 'AWS::URLSuffix', 'AWS::NoValue']);
const { Parameters, Resources, Conditions, Outputs } = template;
const names = new Set([...Object.keys(Parameters), ...Object.keys(Resources)]);

/** Walk a value, tracking the conditions that guard it via Fn::If branches. */
function walk(value, visit, guards = []) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit, guards));
  if (!value || typeof value !== 'object') return;
  if (value['Fn::If']) {
    const [condition, whenTrue, whenFalse] = value['Fn::If'];
    visit({ kind: 'condition', name: condition, guards });
    walk(whenTrue, visit, [...guards, condition]);
    walk(whenFalse, visit, [...guards, `!${condition}`]);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'Ref') visit({ kind: 'ref', name: child, guards });
    else if (key === 'Fn::GetAtt') visit({ kind: 'ref', name: child[0], guards });
    else if (key === 'Fn::Sub') {
      const text = typeof child === 'string' ? child : child[0];
      for (const match of text.matchAll(/\$\{([^}!]+)\}/g)) {
        const name = match[1].split('.')[0];
        visit({ kind: 'ref', name, guards });
      }
      if (typeof child !== 'string') walk(child[1], visit, guards);
    } else if (key === 'Condition' && typeof child === 'string') visit({ kind: 'condition', name: child, guards });
    else walk(child, visit, guards);
  }
}

function referenceProblems(scope, body, ownCondition) {
  const problems = [];
  walk(body, ({ kind, name, guards }) => {
    if (kind === 'condition') {
      if (!Conditions[name]) problems.push(`${scope}: unknown condition ${name}`);
      return;
    }
    if (PSEUDO.has(name)) return;
    if (!names.has(name)) {
      problems.push(`${scope}: unresolved reference ${name}`);
      return;
    }
    const targetCondition = Resources[name]?.Condition;
    if (targetCondition && targetCondition !== ownCondition && !guards.includes(targetCondition)) {
      problems.push(`${scope}: references conditional resource ${name} (${targetCondition}) without a matching guard`);
    }
  });
  return problems;
}

test('generated JSON is in sync with infra/aws/template.mjs', () => {
  const committed = readFileSync(`${root}/infra/aws/oxsig-platform.template.json`, 'utf8');
  assert.equal(committed, `${JSON.stringify(template, null, 2)}\n`, 'Run: node infra/aws/template.mjs > infra/aws/oxsig-platform.template.json');
});

test('every Ref, GetAtt, Sub variable and condition resolves, and conditional resources are guarded', () => {
  const problems = [];
  for (const [name, resource] of Object.entries(Resources)) {
    assert.ok(resource.Type, `${name} has no Type`);
    if (resource.Condition) assert.ok(Conditions[resource.Condition], `${name}: unknown condition ${resource.Condition}`);
    for (const dependency of [resource.DependsOn].flat().filter(Boolean)) {
      if (!Resources[dependency]) problems.push(`${name}: DependsOn unknown ${dependency}`);
    }
    problems.push(...referenceProblems(name, { Properties: resource.Properties, Metadata: resource.Metadata }, resource.Condition));
  }
  for (const [name, output] of Object.entries(Outputs)) {
    problems.push(...referenceProblems(`Output ${name}`, output.Value, output.Condition));
  }
  for (const [name, condition] of Object.entries(Conditions)) {
    problems.push(...referenceProblems(`Condition ${name}`, condition, undefined));
  }
  assert.deepEqual(problems, []);
});

test('every parameter is used', () => {
  const used = new Set();
  walk({ Resources, Outputs, Conditions }, ({ kind, name }) => { if (kind === 'ref') used.add(name); });
  const unused = Object.keys(Parameters).filter((name) => !used.has(name));
  assert.deepEqual(unused, []);
});

test('database is private, encrypted, backed up and snapshot-protected', () => {
  const db = Resources.Database;
  assert.equal(db.Properties.PubliclyAccessible, false);
  assert.equal(db.Properties.StorageEncrypted, true);
  assert.equal(db.Properties.ManageMasterUserPassword, true);
  assert.equal(db.Properties.MasterUserPassword, undefined);
  assert.equal(db.DeletionPolicy, 'Snapshot');
  assert.ok(db.Properties.BackupRetentionPeriod);
  const ingress = Resources.DatabaseSecurityGroup.Properties.SecurityGroupIngress;
  assert.ok(ingress.every((rule) => rule.SourceSecurityGroupId && !rule.CidrIp), 'database must not accept CIDR ingress');
});

test('app tasks only accept traffic from the load balancer', () => {
  const ingress = Resources.AppSecurityGroup.Properties.SecurityGroupIngress;
  assert.deepEqual(ingress.map((rule) => rule.SourceSecurityGroupId), [{ Ref: 'AlbSecurityGroup' }]);
});

test('secrets are injected from Secrets Manager, never as plain environment values', () => {
  const container = Resources.TaskDefinition.Properties.ContainerDefinitions[0];
  const plainNames = container.Environment.map((entry) => entry.Name);
  const secretNames = container.Secrets.map((entry) => entry.Name);
  assert.deepEqual(plainNames.filter((name) => APP_SECRET_KEYS.includes(name)), []);
  assert.deepEqual(secretNames.sort(), [...APP_SECRET_KEYS].sort());
  assert.equal(Resources.AppSecret.Properties.SecretString, undefined, 'no literal secret material in the template');
  assert.equal(Resources.AppSecret.DeletionPolicy, 'Retain');
});

test('runtime configuration matches the documented environment contract', () => {
  const documented = new Set(
    readFileSync(`${root}/.env.example`, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter(Boolean)
  );
  const container = Resources.TaskDefinition.Properties.ContainerDefinitions[0];
  const platformManaged = new Set(['NODE_ENV', 'AWS_REGION']);
  const undocumented = [...container.Environment.map((entry) => entry.Name), ...APP_SECRET_KEYS]
    .filter((name) => !documented.has(name) && !platformManaged.has(name));
  assert.deepEqual(undocumented, []);
});

test('long-lived terminal WebSockets survive the load balancer', () => {
  const attributes = Object.fromEntries(Resources.LoadBalancer.Properties.LoadBalancerAttributes.map((entry) => [entry.Key, entry.Value]));
  assert.ok(Number(attributes['idle_timeout.timeout_seconds']) >= 3600);
  assert.equal(Resources.TargetGroup.Properties.HealthCheckPath, '/api/health');
});

test('the stack can be created without serving traffic or incurring task cost', () => {
  assert.equal(Parameters.DesiredCount.Default, 0);
  assert.equal(Parameters.EnableCleanupSchedule.Default, 'false');
  assert.equal(Parameters.AiProvider.Default, 'openai');
  assert.equal(Parameters.EmailProvider.Default, 'resend');
});

test('cost budget tracks gross usage (credits excluded)', () => {
  assert.equal(Resources.MonthlyBudget.Properties.Budget.CostTypes.IncludeCredit, false);
});

test('PostgreSQL destination matches the production Neon major version', () => {
  assert.equal(Parameters.DbEngineVersion.Default, '18.6');
  assert.equal(Parameters.DbParameterFamily.Default, 'postgres18');
  assert.deepEqual(Resources.DatabaseParameterGroup.Properties.Family, { Ref: 'DbParameterFamily' });
});

test('Polly TTS is available with explicit opt-in and least required task permission', () => {
  assert.equal(Parameters.VoiceTtsProvider.Default, 'elevenlabs');
  assert.equal(Parameters.VoiceTtsFallbackProvider.Default, '');
  const statements = Resources.TaskRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.ok(statements.some((s) => s.Sid === 'VoiceSynthesis'
    && s.Effect === 'Allow'
    && s.Action.includes('polly:SynthesizeSpeech')));
  const vars = Object.fromEntries(
    Resources.TaskDefinition.Properties.ContainerDefinitions[0].Environment
      .map((v) => [v.Name, v.Value])
  );
  assert.deepEqual(vars.OXSIG_VOICE_TTS_PROVIDER, { Ref: 'VoiceTtsProvider' });
  assert.deepEqual(vars.OXSIG_POLLY_REGION, { Ref: 'VoicePollyRegion' });
});

test('AWS Transcribe STT is opt-in and has narrowly scoped transcription-job permissions', () => {
  assert.equal(Parameters.VoiceSttProvider.Default, 'elevenlabs');
  assert.equal(Parameters.VoiceSttFallbackProvider.Default, '');
  const statements = Resources.TaskRole.Properties.Policies[0].PolicyDocument.Statement;
  const transcribe = statements.find((s) => s.Sid === 'VoiceTranscription');
  assert.ok(transcribe);
  assert.deepEqual(transcribe.Action, [
    'transcribe:StartTranscriptionJob',
    'transcribe:GetTranscriptionJob',
    'transcribe:DeleteTranscriptionJob',
  ]);
  const vars = Object.fromEntries(
    Resources.TaskDefinition.Properties.ContainerDefinitions[0].Environment.map((v) => [v.Name, v.Value])
  );
  assert.deepEqual(vars.OXSIG_VOICE_STT_PROVIDER, { Ref: 'VoiceSttProvider' });
  assert.deepEqual(vars.OXSIG_TRANSCRIBE_REGION, { Ref: 'VoiceTranscribeRegion' });
});
