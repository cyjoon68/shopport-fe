import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAudit, loadAuditPolicy } from './audit-policy.mjs';

const policy = loadAuditPolicy();
const allowedPath =
    'apps__mobile>@react-native-community/netinfo>react-native>@react-native/community-cli-plugin>metro>image-size';

const advisory = (id, overrides = {}) => ({
  github_advisory_id: id,
  module_name: 'image-size',
  severity: 'high',
  findings: [{ version: '1.2.1', paths: [allowedPath] }],
  ...overrides,
});

test('allows only the two reviewed image-size Metro advisories', () => {
  const result = evaluateAudit(
    {
      advisories: {
        first: advisory('GHSA-w3rx-r6r6-pgpr'),
        second: advisory('GHSA-5p2g-fcmc-qvqq'),
      },
    },
    policy,
  );

  assert.deepEqual(result, { allowedCount: 2, violations: [] });
});

test('fails closed for an unknown high advisory', () => {
  const result = evaluateAudit(
    {
      advisories: { unknown: advisory('GHSA-unknown-unknown-unknown') },
    },
    policy,
  );

  assert.equal(result.allowedCount, 0);
  assert.equal(result.violations.length, 1);
});

test('fails closed for a reviewed advisory outside the Metro build path', () => {
  const result = evaluateAudit(
    {
      advisories: {
        wrongPath: advisory('GHSA-w3rx-r6r6-pgpr', {
          severity: 'critical',
          findings: [{ version: '1.2.1', paths: ['apps__mobile>image-size'] }],
        }),
      },
    },
    policy,
  );

  assert.equal(result.allowedCount, 0);
  assert.equal(result.violations.length, 1);
});

test('fails closed when audit metadata reports high severity without details', () => {
  const result = evaluateAudit(
    { advisories: {}, metadata: { vulnerabilities: { high: 1, critical: 0 } } },
    policy,
  );

  assert.equal(result.allowedCount, 0);
  assert.equal(result.violations.length, 1);
});
