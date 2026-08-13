import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const policyUrl = new URL('../security/audit-policy.json', import.meta.url);

export const loadAuditPolicy = () => JSON.parse(readFileSync(policyUrl, 'utf8'));

const highSeverities = new Set(['high', 'critical']);
const reviewedSeverity = 'high';

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

const isValidDate = (value) => {
  if (!isNonEmptyString(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
};

const schemaViolation = (detail) => ({
  advisory: 'audit-schema',
  package: 'pnpm-audit',
  severity: 'high',
  paths: [],
  detail,
});

const policyViolation = (detail) => ({
  advisory: 'audit-policy',
  package: 'audit-policy',
  severity: 'high',
  paths: [],
  detail,
});

const validatePolicy = (policy) => {
  const violations = [];
  if (!isPlainObject(policy)) return [policyViolation('policy must be a plain object')];
  if (!isValidDate(policy.reviewedOn)) {
    violations.push(policyViolation('policy reviewedOn must be an ISO date'));
  }
  if (!Array.isArray(policy.exceptions)) {
    violations.push(policyViolation('policy exceptions must be an array'));
    return violations;
  }
  for (const [index, exception] of policy.exceptions.entries()) {
    if (!isPlainObject(exception)) {
      violations.push(policyViolation(`policy exception ${index} must be an object`));
      continue;
    }
    const requiredStrings = [
      'advisory',
      'package',
      'pathPattern',
      'version',
      'reason',
      'upstreamUrl',
      'removeWhen',
      'operationalConstraint',
    ];
    for (const field of requiredStrings) {
      if (!isNonEmptyString(exception[field])) {
        violations.push(policyViolation(`policy exception ${index} missing ${field}`));
      }
    }
    if (exception.severity !== reviewedSeverity) {
      violations.push(policyViolation(`policy exception ${index} severity must be high`));
    }
    if (!isValidDate(exception.expiresOn)) {
      violations.push(
        policyViolation(`policy exception ${index} expiresOn must be an ISO date`),
      );
    }
  }
  return violations;
};

const validateAudit = (audit) => {
  const violations = [];
  if (!isPlainObject(audit))
    return [schemaViolation('audit output must be a plain object')];
  if (!isPlainObject(audit.advisories)) {
    violations.push(schemaViolation('audit advisories must be a plain object'));
  }
  if (!isPlainObject(audit.metadata)) {
    violations.push(schemaViolation('audit metadata must be a plain object'));
  }
  const vulnerabilities = audit.metadata?.vulnerabilities;
  if (!isPlainObject(vulnerabilities)) {
    violations.push(
      schemaViolation('audit metadata vulnerabilities must be a plain object'),
    );
  } else {
    for (const severity of highSeverities) {
      const count = vulnerabilities[severity];
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
        violations.push(
          schemaViolation(
            `audit metadata vulnerabilities.${severity} must be finite and nonnegative`,
          ),
        );
      }
    }
  }
  if (!isPlainObject(audit.advisories)) return violations;
  for (const [key, advisory] of Object.entries(audit.advisories)) {
    if (!isPlainObject(advisory)) {
      violations.push(schemaViolation(`audit advisory ${key} must be an object`));
      continue;
    }
    if (!isNonEmptyString(advisory.severity)) {
      violations.push(schemaViolation(`audit advisory ${key} severity is missing`));
    }
    if (!isNonEmptyString(advisory.module_name)) {
      violations.push(schemaViolation(`audit advisory ${key} module_name is missing`));
    }
    if (
      !isNonEmptyString(advisory.github_advisory_id) &&
      !isNonEmptyString(advisory.id)
    ) {
      violations.push(schemaViolation(`audit advisory ${key} advisory id is missing`));
    }
    if (!Array.isArray(advisory.findings)) {
      violations.push(schemaViolation(`audit advisory ${key} findings must be an array`));
      continue;
    }
    for (const [findingIndex, finding] of advisory.findings.entries()) {
      if (!isPlainObject(finding)) {
        violations.push(
          schemaViolation(`audit advisory ${key} finding ${findingIndex} is invalid`),
        );
        continue;
      }
      if (!isNonEmptyString(finding.version)) {
        violations.push(
          schemaViolation(
            `audit advisory ${key} finding ${findingIndex} version is missing`,
          ),
        );
      }
      if (
        !Array.isArray(finding.paths) ||
        finding.paths.length === 0 ||
        !finding.paths.every((path) => isNonEmptyString(path))
      ) {
        violations.push(
          schemaViolation(
            `audit advisory ${key} finding ${findingIndex} paths are invalid`,
          ),
        );
      }
    }
  }
  return violations;
};

const pathsFor = (advisory) => advisory.findings.flatMap((finding) => finding.paths);

const exceptionFor = (advisory, policy, now) =>
  policy.exceptions.find((exception) => {
    const severity = String(advisory.severity).toLowerCase();
    if (
      exception.advisory !== advisory.github_advisory_id ||
      exception.package !== advisory.module_name ||
      exception.severity !== reviewedSeverity ||
      severity !== reviewedSeverity
    ) {
      return false;
    }
    return now.getTime() < Date.parse(`${exception.expiresOn}T00:00:00.000Z`);
  });

const findingsAllowed = (advisory, exception) =>
  advisory.findings.length > 0 &&
  advisory.findings.every(
    (finding) =>
      finding.version === exception.version &&
      finding.paths.every((path) => new RegExp(exception.pathPattern, 'u').test(path)),
  );

export const evaluateAudit = (audit, policy = loadAuditPolicy(), now = new Date()) => {
  const violations = [...validatePolicy(policy), ...validateAudit(audit)];
  if (violations.length > 0) return { allowedCount: 0, violations };
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return {
      allowedCount: 0,
      violations: [schemaViolation('audit policy clock is invalid')],
    };
  }
  let allowedCount = 0;
  const advisories = Object.values(audit.advisories);
  const highAdvisories = advisories.filter((advisory) =>
    highSeverities.has(String(advisory.severity).toLowerCase()),
  );
  const metadataHigh =
    audit.metadata.vulnerabilities.high + audit.metadata.vulnerabilities.critical;
  if (metadataHigh !== highAdvisories.length) {
    violations.push({
      advisory: 'audit-metadata',
      package: 'pnpm-audit',
      severity: 'high',
      paths: [],
      detail: `metadata high/critical count ${metadataHigh} does not match advisory count ${highAdvisories.length}`,
    });
  }
  for (const advisory of highAdvisories) {
    const severity = String(advisory.severity).toLowerCase();
    const exception = exceptionFor(advisory, policy, now);
    const paths = pathsFor(advisory);
    const pathsAllowed = exception !== undefined && findingsAllowed(advisory, exception);
    if (!pathsAllowed) {
      violations.push({
        advisory: advisory.github_advisory_id ?? advisory.id ?? 'unknown',
        package: advisory.module_name,
        severity,
        paths,
      });
      continue;
    }
    allowedCount += 1;
  }
  return { allowedCount, violations };
};

const readAudit = () => {
  const filePath = process.argv[2];
  const source = filePath ? readFileSync(filePath, 'utf8') : readFileSync(0, 'utf8');
  return JSON.parse(source);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateAudit(readAudit());
  if (result.violations.length > 0) {
    process.stderr.write(
      `${JSON.stringify({ auditPolicy: 'rejected', ...result }, null, 2)}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Audit policy accepted ${result.allowedCount} high/critical exception(s).\n`,
    );
  }
}
