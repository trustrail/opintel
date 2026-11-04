# Opintel companion for OAP

The companion holds the agent's pool key, device identity and XQ API key as **one OAP credential**. Its export is private: use a protected channel, mode-600 files, and never commit or paste it into chat. The companion writes private files under `/run/opintel`, linked to OAP's writable `/tmp`; files are removed on orderly exit. The published image `6bce943`, pinned by digest in the OAP manifest, accepts either a memory-backed or ordinary disk-backed writable emptyDir at `/tmp`. It creates mode-700 private directories and mode-600 files, overwrites live private files before unlinking them, and clears them on startup failure or orderly SIGINT/SIGTERM shutdown. SIGKILL and host failure cannot run cleanup; deleting the ephemeral volume remains the backstop. Overwriting does not guarantee physical erasure from SSDs, snapshots or copy-on-write storage.

## Install the OAP provider

Copy `oap/providers/opintel-agent.yaml` to the OAP checkout's `providers/` directory and rebuild OAP. The provider library is embedded at build time (`providers/embed.go`); it is not loaded from that directory at runtime.

## On the agent host

With the updated agent kit, export its imported identity and pool key:

```sh
./identities export-companion --identity DEVICE_NAME --key-file /PRIVATE/POOL_KEY --api-key-file /PRIVATE/XQ_API_KEY --out /PRIVATE/COMPANION_CREDENTIAL.json
```

Move the resulting file to the Air through a protected channel. OAP's credential entry takes the JSON content; do not pass it on a command line.

## On the Air

From this checkout:

```sh
oap agent lint deploy/companion/oap
oap agent install deploy/companion/oap --namespace default
oap agent setup-identity opintel-analyst
kubectl get sidecartoolbox opintel -n default -o yaml
```

The setup command collects the credential for provider `opintel-agent`. Confirm the toolbox reports `Valid=True`, `Reachable=True`, and the three names in `observedTools`. The default config targets the cloud project. To override it, supply the entire non-secret JSON as one answer:

```sh
oap agent install deploy/companion/oap --namespace default --set 'config={"gateway":"https://GATEWAY","project":"PROJECT_UUID","agentId":"AGENT_ID","caFile":null}'
```

Start a session and ask: “What is the total claim amount per cedant in testing_reinsurance.soak_claims.claims?” The agent should describe the pool, query it, unseal custody values and answer with amounts. Check the agent binding, release and receipts in the Opintel console. After an administrator changes `claim_amount` to aggregate-only, ask for one cedant's claim; the agent should report the minimum-group-size refusal.

The class records allowed hosts `opintel.trustrail.io:443`, `subscription.xqmsg.net:443`, and `validation.xqmsg.net:443`. OAP's stock policy allows coarse outbound TCP rather than enforcing hostnames; a DNS-aware policy controller is needed for host-level enforcement.
