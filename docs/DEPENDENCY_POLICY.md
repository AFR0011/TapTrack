# Dependency Policy

- Node.js 22 and `npm ci` with the committed lockfile define the CI environment.
- Direct dependencies use deliberate versions or bounded semver ranges already represented in
  `package-lock.json`; lockfile changes must be reviewed with the manifest change that caused them.
- Security remediation should choose the smallest compatible resolution. Do not use forced major
  upgrades to silence an audit.
- CI runs full and production `npm audit` checks at the High threshold before product verification.
- New runtime dependencies require a clear product need, compatible license, maintained upstream,
  and focused tests. Browser-test dependencies are development-only.
- Credentials and real account/finance data must never be committed to manifests, lockfiles,
  fixtures, logs, reports, screenshots, or traces.
