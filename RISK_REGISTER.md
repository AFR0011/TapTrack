# Risk Register

Workflow schema: `agentic-workflow/v2`
Project: TapTrack
Repository profile: software
Initialized: 2026-09-05

## Active risks

| ID | Severity | Status | Risk and evidence | Required control |
| --- | --- | --- | --- | --- |
| TT-R01 | Critical | Mitigated with residual — TT-B001 | One global browser-profile ledger formerly could upload under a switched account. All remote finance entry points now require an explicit immutable binding and exact user match. | Live two-account/RLS verification and a recovery design remain required. |
| TT-R02 | Critical | Mitigated with residual — TT-B001 | Local routes are auth-optional and a warmed Chromium shell passes all seven routes offline at both required viewports. | Verify native installed Safari/iOS relaunch and storage eviction before presentation/release. |
| TT-R03 | Critical | Mitigated with residual — TT-B001 | Telegram now fails closed before downstream work when mandatory owner/provider configuration is incomplete and rejects non-owner chats. | Keep disabled until authorized mutation is transactional and idempotent. |
| TT-R04 | High | Mitigated with residual | The path-only history rewrite changed 45 commit IDs and removed the old tip signature. | Verified mirror/bundle/map retained; Support ticket `#4730630` tracks read-only PR refs/cache cleanup. |
| TT-R05 | High | Blocked | The live deployment uses rejected stale provider configuration; live RLS/Auth/grant state is unknown. | Use authorized disposable provider access before any live sync/release claim. |
| TT-R06 | High | Contained — TT-B001 | Destructive full remote replacement is disabled and import/reset remain local-only. | Do not re-enable until one versioned transactional RPC passes rollback/concurrency tests. |
| TT-R07 | High | Open — later batch | Telegram mutation lacks `update_id` idempotency and a database transaction. | Disable/gate unsafe mutation; later add authorized atomic/idempotent RPC. |
| TT-R08 | High | Open — later batch | Import accepts weakly validated arrays and can clear local data then propagate an empty snapshot. | Add versioned strict validation, recoverable pre-import snapshot, confirmation, transaction, and rollback tests. |
| TT-R09 | High | Open — later batch | Retry persistence failures become silent empty state and pull is not cross-table atomic. | Move to durable explicit outbox/error states and transactional dependency-aware application. |
| TT-R10 | High | Blocked | Legacy Supabase primary-key shape and migration rollback are unverified. | Inspect live schema; supply forward/rollback migrations and legacy/fresh tests. |
| TT-R11 | Medium | Open — later batch | Money uses JavaScript `number`; non-finite/non-positive values are not uniformly rejected. | Enforce finite positive precision-normalized values at every boundary and test adversarial inputs. |
| TT-R12 | Medium | Mitigated with residual — TT-B001 | The service worker now uses versioned TapTrack-owned caches and passes current offline route tests. | Add an explicit multi-version upgrade simulation and native Safari verification. |
| TT-R13 | Medium | Mitigated — TT-B001 | Production Playwright passes all seven routes at 320x720 and 390x844, minimum touch targets, overflow, offline persistence, and page-error checks. | Retain the browser gate in CI. |
| TT-R14 | Medium | Mitigated — docs QA | Workflow and project records now distinguish local batch completion from presentation/release readiness. | Keep records synchronized with later verification. |
| TT-R15 | High | Open — later batch | Empty-remote preflight and subsequent sync writes are separate operations, so remote state can change between them. | Move claim-and-initialize into one server-authorized transactional operation with concurrency tests. |

## Current release rule

TT-B001 is complete with residual risks using synthetic data and inert provider configuration. A reviewed remediation branch/PR may be published, but GitHub presentation, merge/release, production provider mutation, or a claim of complete cloud/native safety must stop until the listed live-provider, native-browser, service-worker-upgrade, and remote-transaction controls are verified.
