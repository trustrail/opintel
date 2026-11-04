# Two-host Ubuntu 24.04 deployment

This is a proposed operator runbook, not an acceptance result for Ubuntu or Lightsail. The gateway and engine must have mutually reachable private IPv4 addresses. Replace UPPERCASE placeholders locally; never put credentials, private keys, pairing codes, connection URIs or sessions in Git, chat, shell history or support logs. Commands are one line each. Run installation as the same non-root operator on each host, with Docker access. Docker-group membership grants root-equivalent privileges.

## Firewall and DNS

Point `opintel.trustrail.io` at the gateway's static public IPv4. On the gateway permit inbound TCP 443 from clients, TCP 22 only from operator IPs, and TCP 3102 and 3101 only from `ENGINE_PRIVATE_IP` (heartbeat and optional ingest receipts). Permit TCP 80 publicly for standalone HTTP-01 issuance and renewal; remove it only if another validation method is configured. On the engine permit inbound TCP 3100 and 3103 only from `GATEWAY_PRIVATE_IP`, and TCP 22 only from operator IPs. No other internet inbound ports. The source Postgres port below is private to the engine host and its containers. Allow outbound DNS, HTTPS to XQ, SMTP to the configured relay, and package/image acquisition as required.

Apply private-IP rules using controls that actually filter the private path: AWS Lightsail public-IP firewall rules do not filter private-IP traffic. Configure IPv4 and IPv6 separately; Docker-published ports can bypass ordinary host firewall rules, so validate the effective Docker/host policy from outside and across the private network. The installer publishes 3100, 3101, 3102, 3103 and readiness Postgres 5434 on all interfaces; none may be public. See [Lightsail firewall documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html) and [Docker firewall guidance](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

## Docker on both hosts

Use Docker's official Ubuntu repository, not the distro's conflicting Docker packages. The operator must log out and back in after the group change before running the package commands. See [Docker Engine for Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

After a new login:

```sh
docker info
docker compose version
```

## Gateway: public certificate, archive and install

Before installing the gateway, make sure DNS resolves to the static address and port 80 is reachable and unused. Install Certbot and obtain the certificate with standalone HTTP-01; `ADMIN_EMAIL` is the certificate contact. Standalone must be able to bind port 80 whenever it renews. Certbot does not run inside Opintel. See [Certbot standalone and renewal](https://eff-certbot.readthedocs.io/en/stable/using.html).

```sh
sudo apt-get update
sudo apt-get install -y certbot
sudo certbot certonly --standalone --non-interactive --agree-tos --email ADMIN_EMAIL --cert-name opintel.trustrail.io -d opintel.trustrail.io
mkdir -p "$HOME/opintel/tls" && chmod 700 "$HOME/opintel" "$HOME/opintel/tls"
sudo install -o "$USER" -g "$(id -gn)" -m 600 /etc/letsencrypt/live/opintel.trustrail.io/fullchain.pem "$HOME/opintel/tls/fullchain.pem"
sudo install -o "$USER" -g "$(id -gn)" -m 600 /etc/letsencrypt/live/opintel.trustrail.io/privkey.pem "$HOME/opintel/tls/privkey.pem"
```

The packaged ingress runs as the **numeric UID and GID of the operator who runs `./install`**. Use that same account for the directory and both regular files: directory 700, certificate 600, private key 600. The certificate file must contain the PEM full chain and the key file the matching PEM private key. Docker's privileged daemon, root and processes with the operator's UID can also read them; Unix modes cannot restrict reading to one container.

Copy the gateway archive over a protected channel, then extract its `gateway` directory under `~/opintel`. Edit `package.env` privately: `APP_BASE_URL=https://opintel.trustrail.io`, `OWNER_EMAIL`, `OPINTEL_XQ_API_KEY`, `OPINTEL_XQ_DASHBOARD_API_KEY`, `OPINTEL_XQ_SENDER_ALIAS`, `OPINTEL_XQ_SENDER_ACCESS_TOKEN`, `OPINTEL_XQ_TEAM_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SENDER`, `SMTP_TLS_MODE` (`implicit` or `starttls`), and both absolute `GATEWAY_INGRESS_CERT_FILE` and `GATEWAY_INGRESS_KEY_FILE` paths. Use the paths copied above, not the root-only Certbot symlinks. Preserve the printed custody master key offline and run a protected backup; backup briefly stops services.

```sh
tar -xzf /private/path/gateway-REV-amd64.tar.gz -C "$HOME/opintel"
chmod 700 "$HOME/opintel/gateway"
chmod 600 "$HOME/opintel/gateway/package.env"
${EDITOR:-vi} "$HOME/opintel/gateway/package.env"
cd "$HOME/opintel/gateway" && ./install
cd "$HOME/opintel/gateway" && ./backup
```

The installer derives `GATEWAY_HEARTBEAT_URL` from the public `APP_BASE_URL`.
Before pairing, edit the generated private `state/package.env` and set that one
value to `https://GATEWAY_PRIVATE_IP:3102`; otherwise the engine will try the
public address, which the firewall above does not open on 3102. Confirm that
`GATEWAY_PRIVATE_IP` is the first IPv4 returned by `hostname -I` on the gateway:
the installer includes that address in its application certificate. Keep the
generated file mode 600. The later `./register-engine` command recreates the API
using this value; do not change the public `APP_BASE_URL`.

```sh
hostname -I
${EDITOR:-vi} "$HOME/opintel/gateway/state/package.env"
chmod 600 "$HOME/opintel/gateway/state/package.env"
```

### Renewal

Create `/etc/letsencrypt/renewal-hooks/deploy/opintel-ingress` as a root-owned executable file containing the following, replacing `OPERATOR` with the actual Linux login in **all** paths and ownership arguments. Its two `install` operations replace the mounted files, and `up --force-recreate` creates a fresh ingress mount; there is a brief ingress interruption. The operator must remain a Docker-group member. This procedure is not yet acceptance-tested on Ubuntu.

```sh
#!/bin/sh
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/opintel.trustrail.io ] || exit 0
install -o OPERATOR -g OPERATOR -m 600 "$RENEWED_LINEAGE/fullchain.pem" /home/OPERATOR/opintel/tls/fullchain.pem
install -o OPERATOR -g OPERATOR -m 600 "$RENEWED_LINEAGE/privkey.pem" /home/OPERATOR/opintel/tls/privkey.pem
sudo -u OPERATOR docker compose --ansi never --project-name "$(cat /home/OPERATOR/opintel/gateway/state/project-name)" --project-directory /home/OPERATOR/opintel/gateway --env-file /home/OPERATOR/opintel/gateway/state/package.env -f /home/OPERATOR/opintel/gateway/state/compose.json up --detach --no-deps --pull never --force-recreate --wait ingress
```

Set `-g` to the installer's actual primary group if it differs from `OPERATOR`. Install the hook with root ownership and mode 700, ensure the Certbot timer is enabled, and test renewal in a maintenance window; verify the served certificate after a real renewal. Do not assume an ordinary container restart refreshes a replaced single-file bind mount.

```sh
sudo chmod 700 /etc/letsencrypt/renewal-hooks/deploy/opintel-ingress
sudo chown root:root /etc/letsencrypt/renewal-hooks/deploy/opintel-ingress
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

## Engine and pairing

On the engine host copy and extract the matching archive under `~/opintel`; inspect `hostname -I` first. The installer selects its first IPv4 address automatically. Stop if it is not the intended stable private address; selecting a different advertised address is not supported by the shipped command. Install as the engine operator and retain the printed private engine address and short-lived pairing code. On the gateway use the printed address and code, then check XQ. The pairing code is an argument to the existing command: protect the shell history and terminal; do not send it through chat.

```sh
hostname -I
mkdir -p "$HOME/opintel" && chmod 700 "$HOME/opintel"
tar -xzf /private/path/engine-REV-amd64.tar.gz -C "$HOME/opintel"
cd "$HOME/opintel/engine" && ./install
cd "$HOME/opintel/gateway" && ./register-engine 'https://ENGINE_PRIVATE_IP:3100' 'PAIRING_CODE'
cd "$HOME/opintel/gateway" && ./xq-check
```

Check gateway-to-engine TCP 3100, pairing TCP 3103 and engine-to-gateway TCP 3102 over the private network; 3101 is needed for ingest receipts. The XQ provider, DNS, SMTP and HTTPS routes must be reachable. Open `https://opintel.trustrail.io/sign-in`, request the owner's email link, complete the normal sign-in, create the project, and verify and designate the engine in Settings. If source/heartbeat verification fails, stop and diagnose; do not bypass egress or certificate checks.

## Ordinary synthetic Postgres source on the engine host

Use a separate private Postgres instance, not readiness port 5434. This illustrative container uses the repository's pinned PostgreSQL image and a named durable volume. Create a 700-mode private directory and a mode-600 password file without a newline. The file is a secret; the following prompt does not echo it. The Postgres container publishes only on the engine's private address. The private firewall must not expose port 15432 to the internet or other hosts.

```sh
mkdir -p "$HOME/opintel/source-private" && chmod 700 "$HOME/opintel/source-private"
umask 077; read -r -s SOURCE_PASSWORD; printf '%s' "$SOURCE_PASSWORD" > "$HOME/opintel/source-private/postgres-password"; unset SOURCE_PASSWORD; printf '\n'
docker volume create opintel-v01-data
docker run -d --name opintel-v01 --restart unless-stopped -e POSTGRES_USER=v01 -e POSTGRES_DB=v01 -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password -v "$HOME/opintel/source-private/postgres-password:/run/secrets/postgres-password:ro" -v opintel-v01-data:/var/lib/postgresql/data -p ENGINE_PRIVATE_IP:15432:5432 pgvector/pgvector:pg16@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a
docker exec opintel-v01 pg_isready -U v01 -d v01
```

Transfer and extract the **internal** verification archive on the engine host. For `demo seed` alone, create its private `verification.env` containing `OPINTEL_SEED_MANIFEST=/output/seed.json`; this is separate from the privileged full-soak configuration described in that package's README. In `output/source-uri`, privately enter a URI for `v01` at `ENGINE_PRIVATE_IP:15432`, with the password URL-encoded. Do not print it. The verification job and engine must both reach that address.

```sh
tar -xzf /private/path/verification-REV-amd64.tar.gz -C "$HOME/opintel"
mkdir -p "$HOME/opintel/verification/output" && chmod 700 "$HOME/opintel/verification" "$HOME/opintel/verification/output"
umask 077; printf '%s\n' 'OPINTEL_SEED_MANIFEST=/output/seed.json' > "$HOME/opintel/verification/verification.env"
${EDITOR:-vi} "$HOME/opintel/verification/output/source-uri"
chmod 600 "$HOME/opintel/verification/verification.env" "$HOME/opintel/verification/output/source-uri"
cd "$HOME/opintel/verification" && ./demo seed --target-file /output/source-uri --fixture V-01 --seed 1 --schemas soak_policies,soak_claims,soak_recoveries
cd "$HOME/opintel/engine" && ./sources add v01
```

At the source prompt use `ENGINE_PRIVATE_IP`, port `15432`, database and user `v01`, and the private password. In the console, Data → Connect a source: choose the verified engine, type `secret://sources/v01`, save, select the three schemas after policy application and scan. Create a pool with explicit table, row and treatment decisions. Do not run a customer query until those decisions are complete.

## Remote agent host

Transfer only the agent kit, the agent's licensed XQ export and its own secrets by a protected channel. Docker is required. Use the following normal administrator email sign-in and grant commands from a verification host, or Grant access in the console. The session and pool key are mode-600 secrets; transfer only the pool key to the agent host over a protected channel.

```sh
cd "$HOME/opintel/verification" && ./steps sign-in --gateway https://opintel.trustrail.io --email ADMIN_EMAIL --session-out ./admin.session
cd "$HOME/opintel/verification" && ./steps grant-access --gateway https://opintel.trustrail.io --project PROJECT_ID --pool POOL_ID --agent AGENT_NAME --session-file ./admin.session --key-out ./agent.key
```
 For a custody pool use an identity-bound credential; the agent kit exchanges the imported identity with XQ on that host and binds on first connection. Device name and agent ID are labels, not authorizers.

```sh
mkdir -p "$HOME/opintel" && chmod 700 "$HOME/opintel"
tar -xzf /private/path/agent-KIT-REV-amd64.tar.gz -C "$HOME/opintel"
cd "$HOME/opintel/agent-kit" && ./identities add /private/Export-CERTIFICATE_ID.zip --device DEVICE_NAME --api-key-file /private/xq-api-key
cd "$HOME/opintel/agent-kit" && printf '%s\n' 'device-CERTIFICATE_ID' > active-identity
cd "$HOME/opintel/agent-kit" && ./steps query --gateway https://opintel.trustrail.io --project PROJECT_ID --key-file /private/agent.key --agent-id AGENT_NAME --sql 'SELECT COLUMN FROM SOURCE.SCHEMA.TABLE' --out ./answer.json
```

For custody, use `./steps redeem-and-unseal --help` and the agent kit README; `--show` intentionally reveals values on the agent host. The public certificate should validate against the agent host's normal CA trust; do not copy the installation CA into the kit unless the gateway uses that private CA. Protect identity bundles, XQ key, pool key, result and any unsealed output; none belongs in chat or Git.
