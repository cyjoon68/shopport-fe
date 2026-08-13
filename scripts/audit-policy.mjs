import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const policyUrl = new URL('../security/audit-policy.json', import.meta.url);

export const loadAuditPolicy = () => JSON.parse(readFileSync(policyUrl, 'utf8'));

const highSeverity = new Set(['high', 'critical']);

const pathsFor = (advisory) =>
  Object.values(advisory.findings ?? {}).flatMap((finding) => finding.paths ?? []);

const exceptionFor = (advisory, policy) =>
  policy.exceptions.find(
    (exception) =>
      exception.advisory === advisory.github_advisory_id &&
      exception.package === advisory.module_name &&
      exception.severity.includes(String(advisory.severity).toLowerCase()),
  );

const findingsAllowed = (advisory, exception) => {
  const findings = Object.values(advisory.findings ?? {});
  return (
    findings.length > 0 &&
    findings.every(
      (finding) =>
        finding.version === exception.version &&
        Array.isArray(finding.paths) &&
        finding.paths.length > 0 &&
        finding.paths.every((path) => new RegExp(exception.pathPattern, 'u').test(path)),
    )
  );
};

export const evaluateAudit = (audit, policy = loadAuditPolicy()) => {
  const violations = [];
  let allowedCount = 0;
  const advisories = Object.values(audit.advisories ?? {});
  const highAdvisories = advisories.filter((advisory) =>
    highSeverity.has(String(advisory.severity ?? '').toLowerCase()),
  );
  const metadataHigh =
    Number(audit.metadata?.vulnerabilities?.high ?? 0) +
    Number(audit.metadata?.vulnerabilities?.critical ?? 0);
  if (metadataHigh > 0 && highAdvisories.length === 0) {
    violations.push({
      advisory: 'audit-metadata',
      package: 'unknown',
      severity: 'high',
      paths: [],
    });
  }
  for (const advisory of advisories) {
    const severity = String(advisory.severity ?? '').toLowerCase();
    if (!highSeverity.has(severity)) continue;
    const exception = exceptionFor(advisory, policy);
    const paths = pathsFor(advisory);
    const pathsAllowed = exception !== undefined && findingsAllowed(advisory, exception);
    if (!pathsAllowed) {
      violations.push({
        advisory: advisory.github_advisory_id ?? advisory.id ?? 'unknown',
        package: advisory.module_name ?? 'unknown',
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
