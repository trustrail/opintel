# First deployment: account bootstrap and API supervision

Version: 1.0 — 2026-10-16
Status: proposal for Rick; no implementation approved by this document.
Source baseline: `49be1db`, following `4a0b99d`. Read-only investigation plus this document only; no tests or gate run. The status register remains [slice1-remaining.md](slice1-remaining.md); this position develops A2 and A3 without changing their status. External partner brief and deck are outside this document's ownership.

## Deployment boundary and decision framing

Evaluate one customer-operated application and Engine deployment, not a public SaaS acquisition funnel. The plan's original one-application/one-Engine assumption says it cannot serve a second customer; its following paragraph records the implemented single-tenant Engine registry, rather than a chosen multi-tenant service (`docs/implementation-plan.md:500–505`). A database capable of representing multiple companies is not permission to turn a customer's deployment into public signup.

Costs below are preliminary engineering estimates including focused tests, migration/recovery design and operator documentation, not measured delivery commitments. Integration and security review can change them. No option is implemented here. New audit event names and deployment-claim state described below are proposals, not existing contracts.

## A. First account

### Current behavior and implications

- `request-link` looks up an existing account and pending invitation, then returns a non-disclosing response with no token when both are absent. Only an eligible address reaches token/mail issuance (`src/modules/identity/application/magic-link.ts:62–74`). Completion can create the invited account, but that does not bootstrap an empty installation (`:94–113`).
- OIDC requires a verified email and refuses an unknown account without an invitation (`src/modules/identity/application/oidc.ts:114–122`). Reusing Google exchange therefore does not already supply open signup. Configuring provider credentials, redirects and trusted identity claims remains necessary.
- Account insertion alone does not grant company/project membership (`src/modules/identity/infrastructure/magic-link-repositories.ts:24–26`). However, **an authenticated account is not inert**: `POST /api/v1/companies` requires only authentication, and company creation grants its creator admin membership plus an authorization outbox entry (`src/modules/tenancy/api/company-routes.ts:11`; `src/modules/tenancy/infrastructure/company-creation-repository.ts:43–50`). None of the options may claim “zero privileges until someone assigns a role” without explicitly changing this capability.
- SSO is per company, but “no company membership means no applicable policy” is too broad. The existing check discovers restrictions through allowed email domains, company/project memberships and pending invitations; only an existing company administrator gets the magic-link exception (`src/modules/identity/infrastructure/magic-link-access.ts:11–29`). A completely fresh deployment has no company policy yet. Generic Google authentication must not substitute for the exact configured company provider where enforcement applies.
- There is no first-deployment claim authority. Hand insertion/development seeding is not a production bootstrap contract. Existing account insertion alone is not a bootstrap audit trail; new bootstrap auditing must be explicit. Do not rely on `withPlatformAdmin` to supply it: its audit remains TODO (`src/platform/db/scope.ts:73–79`).

### Common requirements for any selected option

Separate account admission, proof of mailbox/provider identity, company ownership and project/data access. Serialize the deployment claim in durable state; “no users exist” checked outside a transaction is not a claim lock. Bind the intended customer, initial owner and claim identifier; reject changed-input replays. Commit claim/account/membership intent and audit atomically, and dispatch authorization through the existing durable outbox pattern. Do not report usable administrator access before authoritative authorization is available. Partial failure must resume the same claim, not create another company or owner.

Audit proposal: record bootstrap authorization and completion with operator/actor identity where available, deployment/claim/account/company identifiers, intended grants, timestamp and outcome. Never record bootstrap tokens, login tokens, passwords or private keys. Retain an operator receipt before company-scoped audit is possible; define how it links to the eventual company audit rather than silently inventing a globally privileged audit API. Administrative recovery after completion is a separate contract, not re-enabling first-run claim.

### Option 1 — Environment-seeded owner at startup

- **First-owner protection:** operator config supplies one exact owner email and customer identity before exposure; startup atomically claims the installation for that identity. Possession of the operator configuration is the authority, not first HTTP arrival. Do not issue a session until mailbox/provider proof. A typo or compromised configuration still appoints the wrong owner.
- **Access before roles:** account insertion grants no existing project access, but today's authenticated company-create route remains available. Prefer creating the intended company/admin intent as part of bootstrap, rather than letting any first account choose the company; that is new behavior requiring approval.
- **Deployment fit:** fits customer-managed installation and automation; no public signup funnel. Requires secure configuration delivery and controlled removal after success.
- **SSO:** seed designation must not disable an existing company's SSO or grant a fresh magic-link exception to a non-admin. Existing restrictions must run on login. Decide the initial owner's login method before initial enforcement.
- **Enumeration/mail:** public request-link stays unchanged. Only the configured address becomes newly eligible; do not send mail on every restart. The operator can nominate an address, but the public cannot choose arbitrary recipients. Uniform responses and existing rate limits remain; this does not prove absence of every timing side channel.
- **Audit/residual privilege:** record seed source/operator reference, intended owner and grants, completion and conflicting attempts. After completion, changing the environment must not add/replace an owner. The startup code remains present but permanently refuses a second claim; leftover seed configuration is a misconfiguration, not recovery authority.
- **Idempotency/cost/artifact:** durable deployment claim and exact-input comparison make restarts idempotent. Estimate 3–5 engineer-days. Adds bootstrap configuration and startup migration/ordering to an API container or service package; does not depend on Engine image contents. API docs/style packaging remains separately unsettled.

### Option 2 — One-time operator-held bootstrap token

- **First-owner protection:** require a high-entropy, expiring, single-use token delivered privately to the designated operator, bound to an intended owner email/customer; consume with an atomic claim. An unbound token lets its first possessor choose ownership. Do not place it in logged URLs. Network exposure alone cannot confer ownership.
- **Access before roles:** token authorizes only the bootstrap operation; do not treat it as an ordinary admin session. Finish identity proof and explicit initial role assignment. An ordinary authenticated but unassigned account otherwise retains today's company-create capability.
- **Deployment fit:** works for a customer install needing browser onboarding without database access. It adds a public bootstrap attack surface and secure token delivery/expiry/recovery burden, not a SaaS funnel.
- **SSO:** after company establishment, use the normal company enforcement paths. Bootstrap must refuse against an already claimed deployment/company and cannot mint a policy-bypassing session. Specify whether identity proof is mailbox or an operator-configured company IdP.
- **Enumeration/mail:** require token authorization before any bootstrap mail; bind its recipient. Keep ordinary request-link behavior and non-disclosing failures. Unbound recipient input would turn a stolen token into a mail primitive, even if rate-limited.
- **Audit/residual privilege:** record issuance by operator, expiry, consumption, account/grant and safe refusal categories, never token plaintext. After completion the route returns a closed response and cannot reopen through an environment toggle. Rotation of an unused token must invalidate its predecessor.
- **Idempotency/cost/artifact:** token consumption and claim transaction plus a safe completion receipt permit retry without duplicate grants; a consumed token must never become a reusable admin credential. Estimate 5–8 days. Requires API route, UI, token lifecycle/storage and provisioning command in the API artifact. API image/docs packaging is not settled by this option.

### Option 3 — Operator CLI against the database

- **First-owner protection:** authenticated host/database operator runs an explicit, exact-email/customer bootstrap before ingress opens. Database access is the authority. No first-visitor contest and no bootstrap HTTP endpoint. Wrong email/operator compromise remains an operational risk; show the intended identity before mutation.
- **Access before roles:** CLI creates the intended account/company/admin intent using supported scoped repositories, audit and authorization outbox, not arbitrary hand-written SQL. Account-only mode would leave today's company-create ability after login; recommend no such ambiguous intermediate success. No project data permission is inferred from the email.
- **Deployment fit:** strongest fit for the present operator-provisioned single-customer installation, provided the customer accepts a controlled command. It assumes an operator, not a public acquisition funnel.
- **SSO:** CLI does not issue a session or mark email verified. Normal login proves identity and applies existing domain/membership enforcement. It must not modify an existing enforced company as a bootstrap shortcut; use separately governed recovery if needed.
- **Enumeration/mail:** preserve request-link's known-account/invitation restriction and uniform response. CLI may nominate exactly one address under operator authority; no new public arbitrary-address mailing. No automatic mail storm on command replay.
- **Audit/residual privilege:** record operator identity/reference, command/claim identifier, customer/owner and grants, completion and safe failures. Dedicated bootstrap DB privilege should be removed after completion; the installed CLI also refuses a claimed deployment. General DB administrator power already exceeds the product boundary and is not made safe merely by deleting a CLI binary.
- **Idempotency/cost/artifact:** atomic claim, exact-input replay and durable authorization delivery; resume an interrupted command against the same identifiers. Estimate 3–5 days. Ship as a documented one-shot command from the versioned API image (or matching signed release package), not an ad hoc SQL recipe. Its required migrations and runtime resources must be packaged; API docs/style packaging remains a separate build decision.

### Option 4 — Open self-service magic-link/Google signup

The XQ-console comparison is supplied context, not independently verified evidence or a reason to adopt its deployment model.

- **First-owner protection:** **open signup alone provides none**. “First verified signup becomes owner” allows the wrong person to claim an exposed fresh installation. Verified email proves control of that email, not authority over this deployment. Making it safe requires an independent operator claim/approval (options 2/3), so it ceases to solve bootstrap alone.
- **Access before roles:** no membership in existing companies/projects follows account creation, but the existing authenticated company-create route lets that account become administrator of a new company. A genuine zero-access waiting room requires changing that route/admission policy and subsequent membership handling; it is not a free property of OIDC.
- **Deployment fit:** a public signup funnel is a poor default for a private single-customer appliance. A private organization may want self-enrollment, but that needs explicit customer admission rules, not unrestricted email creation.
- **SSO:** keep domain/membership/invitation checks before issuance, callback and session acceptance. Unknown accounts cannot use generic Google to bypass a required company provider. Allowing unrelated identities to create new unenforced companies does not grant access to the protected company, but undermines a single-customer installation policy unless separately prohibited.
- **Enumeration/mail:** open magic links deliberately mail arbitrary submitted addresses; rate limits do not remove this behavior. Uniform responses can conceal account existence but cannot eliminate delivery abuse, observable differences or provider/account-linking side channels. Google-only admission avoids this new mail primitive but retains public account creation and identity/linking risks.
- **Audit/residual privilege:** record verified signup/provider subject, admission decision and every company/role grant with no tokens. Signup remains reachable after bootstrap by definition; an ongoing abuse/support/moderation and account lifecycle contract is required.
- **Idempotency/cost/artifact:** unique verified identity/email handling and transactional account linking can deduplicate callbacks; repeated mail issuance remains deliberately distinct from account creation. Estimate 8–15 days plus ongoing mail/abuse operations and product/security review; company-create admission, provider linking and enforcement changes dominate. Requires API/browser delivery and possibly public ingress. No API container or docs packaging is supplied merely by reusing OIDC.

### Option 5 — Email-domain allowlist plus first-run deployment claim

- **First-owner protection:** an allowlist excludes outsiders but **does not distinguish the authorized owner from another employee, contractor or compromised mailbox in that domain**. First domain member to arrive must not win ownership. Add operator-preassigned exact owner or operator approval/token; otherwise reject this option as insufficient.
- **Access before roles:** allowlisted verification can establish enrollment eligibility, not a role. Existing company-create capability still needs restriction if unassigned accounts are supposed to wait. Bind approved accounts to the intended company; do not let domain admission create an unrelated company.
- **Deployment fit:** useful for customer-internal enrollment after bootstrap, without a public funnel. Shared domains, subsidiaries and contractors need explicit rules; domain strings alone do not establish customer ownership.
- **SSO:** verify email and company provider binding, preserve the existing domain-based SSO restriction, and never substitute generic Google just because its email matches. A deployment allowlist is not the same setting as a company's SSO allowed_domains; define precedence rather than reusing it implicitly.
- **Enumeration/mail:** if any address in an allowed domain can request a link, this newly permits arbitrary mail within that domain. Uniform failures reduce enumeration but do not remove that capability. Exact-owner preassignment during bootstrap avoids broadening request-link; later self-enrollment is a separate choice.
- **Audit/residual privilege:** record operator-set domain/owner configuration, approval, claim and later enrollment decisions. Close claim permanently after completion; any continuing domain-enrollment route is ordinary admission with reviewed policy, not continuing bootstrap privilege.
- **Idempotency/cost/artifact:** durable claim lock and verified-identity uniqueness; reject domain/owner changes on a replay. Estimate 5–8 days including configuration, ownership approval, policy integration and recovery. Requires API configuration and possibly enrollment UI; containerization optional but API image/docs packaging remains unsettled.

### Recommendation and decisions reserved for Rick

Recommend **option 3, a one-shot operator CLI**, packaged with the API release, exact owner/customer selection, durable idempotent claim, explicit audit/outbox, no session issuance and no new public signup route. This fits existing customer/operator provisioning and avoids changing 5.19 admission policy to solve deployment setup. Option 2 is the alternative if Rick requires browser onboarding without operator database access. Neither is a recommendation to expose a privileged raw database endpoint.

Rick must decide:

1. Who is authorized to nominate the first owner: customer operator, Opintel installer, or a named customer administrator? Is a database-capable one-shot command acceptable?
2. Must bootstrap create exactly one company and its initial administrator, or should account creation and company claim be distinct? Are additional companies permitted in one customer deployment? Today's company-create route matters to that choice.
3. Must the first login use a preconfigured company IdP, or may it prove mailbox possession before SSO is configured? Who owns break-glass/recovery and reassignment of a mistyped/unavailable owner?
4. Is any post-bootstrap self-enrollment wanted? If yes, exact approved identities, a customer domain, or public signup—and is arbitrary-address mail an accepted product behavior?
5. What operator identity/approval record is authoritative before company-scoped audit exists, and what customer-visible bootstrap receipt is required?

## B. Production API supervision

### Current implementation

The Engine is containerized with `restart: unless-stopped` (`deploy/engine/compose.yml:42`) and customer/operator ownership (`deploy/engine/README.md:80–81`). The repository's API launch script is a development watcher (`package.json:17`); there is no equivalent production API supervisor artifact.

API startup awaits evidence forward provisioning before accepting requests (`src/platform/http/start.ts:163–168`, `:308`). Hourly maintenance runs in that same process (`src/platform/http/evidence-maintenance.ts:4–19`), and errors are logged with a maintenance-failed category. SIGTERM/SIGINT close workers/listeners and stop maintenance (`src/platform/http/start.ts:309–322`); startup failure exits nonzero (`:325–327`). A supervisor is still needed to observe and restart that process.

Provisioning invokes the database partition function and observes its horizon (`src/modules/evidence/infrastructure/maintenance.ts:9–16`). An API outage stops its timer; existing future partitions mean this is not necessarily an immediate partition outage. If the horizon is exhausted, writes can fail. Evidence failure must continue to prevent a successful answer (`src/modules/mcp/application/query.ts:34`, `:72–74`). Restart configuration must not bypass startup provisioning or convert failed evidence writes into successful reads.

### What S5 packaging owes

A versioned API runtime artifact and entrypoint (not tsx --watch); pinned dependencies/runtime resources; explicit migration/startup ordering; least-privilege service identity and secrets; restart policy, backoff and operator-visible crash-loop handling; readiness separate from mere process liveness; safe logs, health/maintenance-horizon alerts, graceful shutdown; host boot enablement; and a named operator/support handoff. The Engine's source egress and sandbox policy cannot simply be copied: API dependencies include Postgres, Redis, SpiceDB, mail/identity providers, Engine routing, and configured custody providers. Enumerate those actual network/secret needs.

The browser build imports `docs/opintel-master.css` (`src/shared/ui/styles.ts:1`). Engine Docker copies docs at build/runtime (`deploy/engine/Dockerfile:10`, `:26`), but that settles only that image. **API image packaging is not settled.** If it builds/serves the console, docs must exist in its build context; compiled browser assets can be shipped without all docs at runtime. Backend compilation/runtime resources, migrations, worker modules, SDK loading and static-serving/reverse-proxy behavior need an explicit API manifest. If console hosting is separate, define its artifact independently; do not assume Vite's build emits a production API server.

### Supervision options

| Option | Artifact and docs implications | Reliability, ownership and cost |
|---|---|---|
| Dedicated API container under Compose | Build a separate API target/image with a production command; reuse the release version, not the Engine command. Supply docs for console build if bundled; decide runtime resources explicitly. Existing Engine Dockerfile does not prove API packaging. | Mirrors the customer-operated Engine model and minimizes orchestration variety. Restart on exit, boot-enabled Docker, readiness, log rotation and crash-loop alerting still need configuration. Compose restart alone does not restart an unhealthy-but-running process. Estimate 3–5 days including packaging, stop/restart/readiness checks and runbook; customer operates host/Docker/dependencies. |
| Native service under systemd | API ships as a compiled, versioned release bundle with pinned Node and service unit, not necessarily a container. Package console/docs build separately; docs need not be runtime-mounted if assets are compiled. | Restart=on-failure with backoff/start limits, dedicated user, protected filesystem, explicit network/service ordering and journal retention. Fits customers prohibiting Docker for API, but creates a second supported runtime beside Engine Compose. Estimate 4–7 days plus OS/package support matrix and upgrades. |
| Existing customer orchestrator (e.g. Kubernetes) | Same dedicated API container is needed; add deployment/service/secret/probe and migration-job manifests. API docs/assets decision remains identical to the Compose image. | Suitable only if customer already operates it. Readiness/liveness, resource limits, disruption handling and independent jobs are natural, but replicas are not free: singleton maintenance/background loops and idempotency must be reviewed. Estimate 6–10 days on top of image work, plus cluster operations. Do not introduce a cluster solely to restart one API. |

Recommendation: **dedicated API container under Compose**, matching the Engine's operator model while giving the API its own command, permissions, dependencies and health policy. Reuse the packaging pattern, not the Engine runtime/security assumptions. Native service is a supported alternative only if Rick/customer requires it; do not promise two deployment products without paying for both.

### Where hourly evidence provisioning should run

| Option | Consequence and artifact | Cost and recommendation |
|---|---|---|
| Keep startup + hourly maintenance in supervised API | One runtime; startup remains a fail-closed readiness prerequisite. Alert on partition horizon and maintenance failures, not only API liveness. Provisioning pauses while API is down, but API cannot deliver queries while down either. Recovery must provision before readiness. API container/service includes the maintenance code. | Lowest operational cost, roughly 1–2 days of health/runbook work beyond supervisor packaging. **Recommend for initial single-instance deployment**, subject to required outage tolerance and adequate forward horizon. Do not claim independent maintenance availability. |
| Dedicated supervised maintenance worker | Same versioned API image with a distinct maintenance command and narrowly scoped credentials; startup API still verifies/provisions readiness. Split scheduling ownership explicitly, coordinate overlap, and preserve bounded/idempotent operations and audit. Worker survives API crashes but shares DB failure risk. | Roughly 3–5 additional days plus a second monitored service, deployment ordering and credential lifecycle. Prefer when partition/retention availability must be independent of API uptime. Separate provisioning from destructive retention authorization; moving timers is not permission to change policy. |
| External scheduled one-shot job | API image command under systemd timer or existing orchestrator CronJob; missed-run catch-up, singleton execution, deadlines, status and alerting are required. API retains startup readiness check. Plain unmonitored cron is insufficient. | Roughly 2–4 additional days if scheduler already exists; more if it does not. Useful for an established operator scheduling service, not automatically simpler than one supervised worker. API docs/resources still need packaging for the job image. |

### When the process will not start

Proposed operator runbook: retain the nonzero exit and safe startup category; check exact deployed version/migration compatibility and required configuration, then Postgres, Redis/SpiceDB, TLS/trust and configured service dependencies as indicated by the failure. Inspect provisioning/horizon diagnostics and database privileges/locks when evidence readiness fails. Do not print secret values, suppress the provisioning error, disable evidence, repeatedly restart without diagnosis, or manually edit migration checksums. A supervisor backs off and alerts the named operator; after correcting the cause, start once and verify readiness and provisioning horizon. Preserve logs and escalate an unexplained application failure with version and safe diagnostics. Any rollback must respect applied migration compatibility and durable evidence; “roll back the image” is not a blanket recovery instruction.

Rick must decide:

1. Is Docker Compose the supported customer API runtime, or must a specific customer's existing service manager/orchestrator be supported?
2. Who owns host boot, restarts, secrets/certificates, alerts and incident response? What is the support escalation boundary between customer and Opintel?
3. What API recovery-time and evidence-maintenance outage tolerance must the package meet? Must provisioning/retention continue independently while API is intentionally offline?
4. Does the API image also serve the console, or does a customer reverse proxy/static host serve a separately versioned browser artifact?
5. Is a single API instance the deployment contract? Additional replicas require explicit ownership of maintenance and other startup timers, not just a replica-count change.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-16 | Record first-account and API-supervision implementation boundaries, five admission options, deployment/maintenance choices, costs and decisions for Rick. | Proposal only. No code, policy, deployment, test or external-document changes. |
