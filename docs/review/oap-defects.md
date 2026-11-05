# OAP defects from the first Opintel companion install

Target: AuthZed Open Agent Primitives checkout `e97928b`. Runtime evidence below
was supplied by the user from OAP desktop on the Air. Source paths are relative
to that checkout (inspected under ignored `tmp/openagentprimitives`). No OAP
source changes or substitute OAP flows were implemented here.

## 1. setup-identity ignores sidecars

Observed: `oap agent setup-identity opintel-analyst` reported no toolspecs or MCP
servers, so there was nothing to set up despite a credentialed SidecarToolbox.
`cmd/oap/internal/agentcmd/setup_identity.go:89-97` collects tool-bundle toolspecs
and MCPServers only. `pkg/controllers/agentsession/credential_grants.go:492-520`
resolves sidecar credentials separately, naming the entry `<ref>-creds`.

Workaround: declare `opintel-creds` as static, with the named Secret/key, and use
`oap identity put-token ... --from-file ...`. Source verification:
`cmd/oap/internal/identitycmd/put_token.go:171-226` resolves the credential's
secretRef; `cmd/oap/internal/dotenv/secretwrite.go:25-34` creates a missing Secret.
No empty Secret or secret value belongs in the bundle. Desired upstream fix:
include sidecar upstreamAuth requirements in setup-identity.

## 2. Sidecar-only SpiceboxClass still requires image and tools

Observed: `Valid=False InvalidImage: spec.image must be set`.
`pkg/controllers/spiceboxclass/controller.go:582-589` rejects both an empty image
and an empty tool list without a sidecar-only exception. The bundle now asks for
sandboxImage, defaulting to desktop's `spicebox-sandbox:dev`, and includes a
harmless `/bin/true` noop. Other installations must answer with the operator's
sandbox image; no automatic cluster-image reference was established. Desired
upstream fix: a sandbox-policy-only class or explicit sidecar-only validation.

## 3. Runner identity-read RBAC excludes sidecar-only classes

Observed: runner MCPAuthResolutionFailed, forbidden get of AgentIdentity
`opintel-analyst-identity`. The controller's per-session identity permission is
conditional on MCPServers or ToolBundles, omitting SidecarToolboxes:
`pkg/controllers/agentsession/controller.go:2034-2041`.

Workaround: two explicit kubectl commands in the run sheet grant get on just
that identity to `system:serviceaccounts:default`, not Secret reads. This matches
the user's working workaround. Remove the workaround when upstream correctly
pins sidecar runner identity reads to the session's service account.

**Bundle RBAC cannot be shipped in manifests:**
`pkg/platform/oap/bundle.go:40-52` is a closed allowlist excluding Role and
RoleBinding; `Bundle.Validate` checks it at lines 118-120 and
`checkAllowedKinds` rejects it at lines 159-168. This is an intentional security
boundary, not a bug to bypass. Therefore there is no `manifests/rbac.yaml`.

## 4. Unset budget prevents status updates and leaves a stale invalid verdict

Observed: the toolbox became valid, but AgentClass still displayed
AgentClassSidecarToolboxInvalid. Its status update was rejected because
`effectiveSettings.budget.maxTokens` and maxTurns were zero and require >=1.
Setting maxTurns=50, maxTokens=500000, maxDuration=30m worked on the Air.

Source: `pkg/apis/v1alpha1/agentclass_types.go:459-463` declares the minima;
`pkg/controllers/agentclass/controller.go:1128` populates EffectiveSettings;
line 1372 writes status. The sidecar invalid reasons are at lines 1756-1766.
The rejected write is user-retained runtime evidence; it was not reproduced
locally. Proposed upstream investigation: default/validate budgets before status
construction, and make status-write failures visible rather than leaving an old
condition that points at an already-fixed toolbox.

## 5. allowedHosts is recorded but not enforced

Source-confirmed: `pkg/controllers/agentsession/cosidecar/cosidecar.go:66-69`
explicitly states AllowedHosts is never read by that package and allowlist mode
permits TCP 80/443 to 0.0.0.0/0. Our manifest records the required hosts but cannot
promise hostname enforcement. Upstream needs a DNS-aware enforcement mechanism
or clear API/status semantics distinguishing recorded intent from enforcement.

## 6. run ends Failed: Stalled after an answer

User-observed: a completed answer was displayed, then the run ended
`Failed: Stalled`. `pkg/agent/runner/loop.go:884-902` distinguishes channel-attached
idle from non-channel/delegated failure when the terminal tool was not called;
`cmd/oap/internal/agentcmd/run.go:39-43` uses the run command/session path.

This branch is a plausible explanation, not proof of the exact Air execution:
no retained model-turn/terminal-tool trace was supplied. Upstream should correlate
that trace with terminal-state selection and ensure completed user-visible answers
have a clear completion contract. We do not change the runner or claim that an
answer implies successful terminal status.

## Related private-image and chat observations

The Air required host Docker pull followed by VM containerd import because user
sidecar pods deliberately get no ImagePullSecret
(`pkg/controllers/agentsession/controller.go:827-832`). The package remains
private. `cmd/oap/internal/imageload/imageload.go:16` recognizes `oap-desktop`,
while the Air VM context was `default`; `installcmd/image.go:77-90` selects an
unsupported-registry route for an unrecognized context. The run sheet includes
both the native image-load command and the user's working docker-save/SSH import.
The imported index digest was preserved in the Air evidence.

The user also observed `oap agent chat` browser sign-in HTTP 500; the cause is
not established from supplied evidence. `oap agent run` and the web sessions page
worked. No claim is made that this companion change fixes that OAP sign-in path.
