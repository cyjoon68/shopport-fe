# Dependency audit policy

The two current `image-size@1.2.1` high-severity advisories are temporarily accepted only for the Metro build-time dependency path recorded in `audit-policy.json`. Runtime and user-supplied uploads do not reach Metro. A malicious asset from a public fork may still reach pull-request build inputs and cause CI availability DoS; the risk is bounded by the 20-minute verify timeout, read-only `contents` permission, no secrets or static provider credentials, and the `pull_request` trigger rather than `pull_request_target`. EAS preview, signing, and deployment credentials are never run in PR CI.

The exceptions were reviewed on 2026-08-13 and expire on 2026-09-13. Remove them when a patched `image-size` release is available or an Expo SDK update replaces the affected Metro dependency. The policy rejects all other high or critical findings, and it rejects a severity change to critical even when the advisory, package, version, and path are unchanged.
