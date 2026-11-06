# Opintel companion for OAP

OAP-02 image `369cf0c` is published for amd64 and arm64 and pinned by its verified index digest in the bundle. The Intel live check passed; the updated Air/OAP installation is user verification.

The companion holds the pool key, device identity and XQ API key as **one private OAP credential**. Use mode-600 files and a protected transfer; never paste credentials into chat, git, command arguments or logs. `/run/opintel` points into writable `/tmp`, which may be memory-backed or ordinary ephemeral disk. Private directories are mode 700 and files mode 600. Startup failure and orderly SIGINT/SIGTERM overwrite and remove live private files. SIGKILL/host failure cannot run cleanup; delete the ephemeral volume. Overwrite is not physical erasure of SSD, snapshot or copy-on-write history.

## Air run sheet (OAP e97928b)

These commands assume the desktop and its VM already work. Run them on the Air unless noted. Use the existing OAP checkout if present; the clone commands below are for new checkout directories. The companion package stays private on GHCR.

### 1. Get the branch and rebuild OAP with the provider

```sh
export OPINTEL_CHECKOUT="$HOME/opintel-oap"
export OAP_CHECKOUT="$HOME/openagentprimitives"
git clone --branch feat/oap-companion https://github.com/trustrail/opintel.git "$OPINTEL_CHECKOUT"
git clone https://github.com/authzed/openagentprimitives.git "$OAP_CHECKOUT"
git -C "$OAP_CHECKOUT" checkout e97928b
cp "$OPINTEL_CHECKOUT/deploy/companion/oap/providers/opintel-agent.yaml" "$OAP_CHECKOUT/providers/opintel-agent.yaml"
cd "$OAP_CHECKOUT"
mage build:oap && mage desktop:all
```

Quit the old OAP app normally, then launch the rebuilt app and wait for its VM to be ready:

```sh
open "$OAP_CHECKOUT/build/desktop/out/oap.app"
export PATH="$OAP_CHECKOUT/bin:$PATH"
cd "$OPINTEL_CHECKOUT"
```

Provider YAML is embedded (`providers/embed.go:9`, `pkg/platform/identity/provider/loader.go:47`); copying it without rebuilding does not register it.

### 2. Prepare the private credential file

On the **agent-kit host**, export the imported identity and credential. Replace uppercase private paths with local paths:

```sh
./identities export-companion --identity DEVICE_NAME --key-file /PRIVATE/POOL_KEY --api-key-file /PRIVATE/XQ_API_KEY --out /PRIVATE/companion-credential.json
```

Transfer that file to the Air through a protected channel, then:

```sh
chmod 600 /PRIVATE/companion-credential.json
```

This is the JSON document, not `companion.env`. The bundle contains only a Secret reference, never the value.

### 3. Lint, install and store the credential

**Before running `oap agent install` below, complete step 5, including both the containerd import and digest-name tag.** The probe runs during installation.

```sh
oap agent lint deploy/companion/oap
oap agent install deploy/companion/oap --namespace default
oap identity put-token opintel-analyst-identity --namespace default --credential opintel-creds --from-file /PRIVATE/companion-credential.json
```

`put-token` reads `opintel-creds`' declared secretRef and **creates or updates** Secret `opintel-companion-credential`, key `credential`; a pre-existing Secret is unnecessary (`identitycmd/put_token.go:171`, `dotenv/secretwrite.go:25-34`). Do not use `setup-identity` for this sidecar: this OAP build enumerates only tool bundles and MCP servers.

The install questions default to the cloud config and desktop sandbox image `spicebox-sandbox:dev`. Other clusters must supply the sandbox image that matches their operator's `--sandbox-image`; this is an explicit bundle question, not automatic discovery:

```sh
oap agent install deploy/companion/oap --namespace default --set 'sandboxImage=CLUSTER_SANDBOX_IMAGE' --set 'config={"gateway":"https://GATEWAY","project":"PROJECT_UUID","agentId":"AGENT_ID","caFile":null}'
```

The harmless `noop` tool and sandbox image satisfy OAP's current SpiceboxClass validator; they are not agent-visible Opintel tools.

### 4. Apply the narrowly scoped runner identity-read workaround

OAP's bundle allowlist **rejects Role and RoleBinding**, so they must not be placed in `oap/manifests/`. Run these two commands once per namespace; the examples intentionally target `default`:

```sh
kubectl create role opintel-identity-reader -n default --verb=get --resource=agentidentities.agentprimitives.authzed.com --resource-name=opintel-analyst-identity
kubectl create rolebinding opintel-identity-reader -n default --role=opintel-identity-reader --group=system:serviceaccounts:default
```

This grants all service accounts in `default` get access to this **one AgentIdentity**, not Secret read access. It works around `pkg/controllers/agentsession/controller.go:2041`, whose identity-read grant omits sidecar-only classes. On repeat installs, leave the existing matching Role/RoleBinding in place. See `docs/review/oap-defects.md` for removal criteria.

### 5. Load the private companion image into the VM

Use a Docker account already authorized to pull the private GHCR package. Keep the bundle's digest pin; do not replace it with a tag. The tag below identifies the image to export; verify its pulled index digest matches `spec.source.image` before importing.

```sh
export COMPANION_TAG=ghcr.io/trustrail/opintel-companion:369cf0c
docker pull "$COMPANION_TAG"
docker buildx imagetools inspect "$COMPANION_TAG"
kubectl config current-context
```

Choose **one** load route:

- When the active context is `oap-desktop`:

  ```sh
  oap image load "$COMPANION_TAG"
  ```

- When the desktop VM's kube-context is `default` (the observed Air case), `oap image load` rejects it. Use the same Docker-save/containerd-import path directly; `192.168.64.2` is that Air VM's address, so substitute the actual VM address if different:

  ```sh
  set -o pipefail
  docker save "$COMPANION_TAG" | ssh -i "$HOME/Library/Application Support/oap/ap-vm-key" root@192.168.64.2 'k3s ctr -n k8s.io images import -'
  ssh -i "$HOME/Library/Application Support/oap/ap-vm-key" root@192.168.64.2 'k3s ctr -n k8s.io images tag ghcr.io/trustrail/opintel-companion:369cf0c ghcr.io/trustrail/opintel-companion@sha256:2f3cc453765f03a0301c7cd51bc7a83592f89c150f2246f204c4fb2ebbe53d13'
  ```

The Air's successful import preserved the index digest. OAP deliberately supplies no image pull Secret for user sidecars; authenticated host-side pull and VM import are required here. No package-visibility change is needed. The import and digest-name tag must both happen **before `oap agent install`**, because the probe runs at install. If installation already probed before the image was available under the digest name, bump the SidecarToolbox `spec.version` to trigger a new probe after import and tagging. Air reinstall evidence supplied by the user: Valid/Reachable/PinMatch succeeded after this tag, with no manual spec patches. This is user-reported acceptance evidence, not a new local OAP run.

### 6. Verify conditions, then run and open the sessions page

```sh
kubectl get sidecartoolbox opintel -n default -o jsonpath='{range .status.conditions[*]}{.type}={.status} {.reason}{"\n"}{end}'
kubectl get sidecartoolbox opintel -n default -o jsonpath='{.status.observedTools}{"\n"}'
kubectl get agentclass opintel-analyst -n default -o jsonpath='{range .status.conditions[*]}{.type}={.status} {.reason}{"\n"}{end}'
oap agent run opintel-analyst --namespace default --prompt 'What is the total claim amount per cedant in testing_reinsurance.soak_claims.claims?'
open http://127.0.0.1:17080/sessions
```

Require toolbox `Valid=True`, `Reachable=True`, all three tools in `observedTools`, and AgentClass `Valid=True`. The agent should describe once, query the appropriate grouped result, unseal custody grants and answer without guessing. Check the corresponding receipts in Opintel. With `claim_amount` changed by an administrator to aggregate-only, a request for one undersized group's claim must report the gateway's refusal.

The user observed `oap agent chat` fail its browser sign-in with HTTP 500 on this OAP build; `oap agent run` and the web sessions page worked. A run also ended `Failed: Stalled` after showing a completed answer; do not treat a visible answer as proof of a successful terminal status. This is reported separately to AuthZed.

The class records `opintel.trustrail.io:443`, `subscription.xqmsg.net:443`, and `validation.xqmsg.net:443`. Stock OAP e97928b does not enforce hostname restrictions; it permits coarse TCP 80/443. A DNS-aware policy backend is needed for host-level enforcement.

### Unseal lookup and OAP permissions

`opintel_unseal` accepts `evidenceId`, `grantId`, or both from a previous query.
When both are present, it looks up `grantId` and checks that the grant belongs to
`evidenceId`. Neither is a `validation_failed` refusal; mismatched references are
also refused before any share is redeemed. There is no gateway upgrade for this
companion-side lookup correction.

OAP's `readonly` and `readwrite` policies require a SpiceDB resource check. This
bundle delegates governance to Opintel and has no OAP resource mapping, so its
three permission blocks use `passthrough`, as OAP's own external-service sidecars
do. MCP read-only annotations identify describe/query as reads and unseal as a
state change (the one-time grant is consumed).

Every release acceptance now checks the kit and companion against the candidate
gateway: row query, aggregate, local unseal and refused replay. The live checker
records counts and evidence IDs, never result values. These checks run after the
browser stage in both packaged acceptance harnesses.
