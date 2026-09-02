import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { evaluateAudit, loadAuditPolicy } from './audit-policy.mjs';

const policy = loadAuditPolicy();
const fixturesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const workflow = readFileSync(
  resolve(fixturesDirectory, '../../.github/workflows/ci.yml'),
  'utf8',
);
const fixture = (name) =>
  JSON.parse(readFileSync(resolve(fixturesDirectory, `${name}.json`), 'utf8'));

test('allows only the two reviewed high image-size Metro advisories', () => {
  const result = evaluateAudit(fixture('audit-known'), policy);

  assert.deepEqual(result, { allowedCount: 2, violations: [] });
});

test('keeps PR verification isolated from fork credentials and privileged triggers', () => {
  assert.match(workflow, /pull_request:/u);
  assert.doesNotMatch(workflow, /pull_request_target/u);
  assert.match(workflow, /timeout-minutes: 20/u);
  assert.match(workflow, /permissions:\n\x20{2}contents: read/u);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/u);
  for (const forbidden of [
    /secrets\./u,
    /EXPO_TOKEN/u,
    /EAS_TOKEN/u,
    /APPLE[_-](?:CERTIFICATE|KEY|PASSWORD)/u,
    /GOOGLE[_-](?:APPLICATION|PLAY)/u,
  ]) {
    assert.doesNotMatch(workflow, forbidden);
  }
});

test('rejects a reviewed advisory if its severity is critical', () => {
  const result = evaluateAudit(fixture('audit-critical'), policy);

  assert.equal(result.allowedCount, 0);
  assert.equal(
    result.violations.some((violation) => violation.severity === 'critical'),
    true,
  );
});

test('fails closed for an unknown high advisory', () => {
  const result = evaluateAudit(fixture('audit-unknown-high'), policy);

  assert.equal(result.allowedCount, 0);
  assert.equal(result.violations.length, 1);
});

test('fails closed for a reviewed advisory outside the Metro build path', () => {
  const audit = fixture('audit-known');
  audit.advisories.first.findings[0].paths = ['.>image-size'];
  audit.metadata.vulnerabilities.high = 1;
  delete audit.advisories.second;
  const result = evaluateAudit(audit, policy);

  assert.equal(result.allowedCount, 0);
  assert.equal(result.violations.length, 1);
});

test('fails closed for malformed or missing audit schema', () => {
  const malformedCases = [
    fixture('audit-malformed'),
    { advisories: [], metadata: { vulnerabilities: { high: 0, critical: 0 } } },
    { advisories: {}, metadata: { vulnerabilities: { high: Number.NaN, critical: 0 } } },
    { advisories: {}, metadata: { vulnerabilities: { high: 0, critical: '0' } } },
    {
      advisories: { broken: { severity: 'high' } },
      metadata: { vulnerabilities: { high: 1, critical: 0 } },
    },
  ];

  for (const audit of malformedCases) {
    const result = evaluateAudit(audit, policy);
    assert.equal(result.allowedCount, 0);
    assert.ok(result.violations.length > 0);
  }
});

test('fails closed when metadata high and critical counts do not match advisories', () => {
  const result = evaluateAudit(fixture('audit-metadata-mismatch'), policy);

  assert.equal(result.allowedCount, 1);
  assert.equal(
    result.violations.some((violation) => violation.advisory === 'audit-metadata'),
    true,
  );
});

test('expires exceptions using an injected clock', () => {
  const active = evaluateAudit(
    fixture('audit-known'),
    policy,
    new Date('2026-09-12T23:59:59.999Z'),
  );
  const expired = evaluateAudit(
    fixture('audit-known'),
    policy,
    new Date('2026-09-13T00:00:00.000Z'),
  );

  assert.deepEqual(active, { allowedCount: 2, violations: [] });
  assert.equal(expired.allowedCount, 0);
  assert.equal(expired.violations.length, 2);
});
