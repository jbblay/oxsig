import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile(new URL('../../infra/aws/desktop-guest-parameter-read.policy.json', import.meta.url), 'utf8'));

test('desktop credential guest IAM grants only the specific expiring SSM parameter path', () => {
  assert.equal(policy.Version, '2012-10-17');
  assert.equal(policy.Statement.length, 1);
  const [statement] = policy.Statement;
  assert.equal(statement.Effect, 'Allow');
  assert.deepEqual(statement.Action, ['ssm:GetParameter']);
  assert.equal(statement.Resource, 'arn:aws:ssm:eu-central-1:094525993701:parameter/oxsig/desktop-access/*');
  assert.deepEqual(statement.Condition, {
    Bool: { 'aws:SecureTransport': 'true' },
    StringEquals: { 'aws:RequestedRegion': 'eu-central-1' },
  });
});
