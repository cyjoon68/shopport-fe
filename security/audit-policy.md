# Dependency audit policy

The two current `image-size@1.2.1` high-severity advisories are temporarily accepted only for the Metro build-time dependency path recorded in `audit-policy.json`. This is a limited risk acceptance: Metro build inputs may come only from trusted repository assets. Runtime, external, and user-supplied assets must not be passed to Metro.

The exceptions were reviewed on 2026-08-13 and expire on 2026-09-13. Remove them when a patched `image-size` release is available or an Expo SDK update replaces the affected Metro dependency. The policy rejects all other high or critical findings, and it rejects a severity change to critical even when the advisory, package, version, and path are unchanged.
