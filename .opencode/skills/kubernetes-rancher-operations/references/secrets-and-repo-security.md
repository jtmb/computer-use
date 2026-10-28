# Secrets and Repository Security

Use this reference when secrets live in Git, a repository changes visibility,
a deploy key or token is introduced, or credential exposure is suspected.

## Rules

- No plaintext secret in Git, ever, including "temporary" test values.
- Encrypt before the first commit; removing it later does not remove it from
  history or from clones and caches.
- Keep the decryption key outside the repository and outside the rendered
  manifests. Inject it at runtime or store it in a Secret.
- Do not print Secret values, tokens, kubeconfigs, or private keys to prove
  they exist. Compare hashes or key names instead.
- Commit and push are separate approvals. Changing repository visibility is a
  security change and needs its own approval.

## SOPS with age

Typical layout:

```text
.sops.yaml                 # creation rules: which paths use which recipient
clusters/<env>/.../*.yaml  # encrypted values in place
```

```bash
# create a key pair once, outside the repo
age-keygen -o ~/.config/sops/age/keys.txt

# verify what would be encrypted and with which recipient
sops --encrypt --in-place path/to/secret.yaml

# prove the ciphertext still decrypts, without printing values
sops --decrypt path/to/secret.yaml | sha256sum

# edit safely
sops path/to/secret.yaml
```

Validation pattern for a migration:

1. hash each live Secret's `data` map before the change;
2. decrypt the committed file and hash the same keys;
3. require the hashes to match;
4. never store the decrypted output.

```bash
kubectl -n <ns> get secret <name> -o json \
  | jq -S '.data' | sha256sum
sops -d path/to/secret.yaml \
  | yq -o=json '.stringData // .data' | jq -S . | sha256sum
```

If the shapes differ, normalize first; a mismatch is a finding, not a formatting
detail.

## Git history scanning

Scan the working tree and the full history before publishing or after an
accident.

```bash
gitleaks detect --source . --redact
gitleaks dir . --redact
git log -p --all -S '<known-token-prefix>' -- .
```

A clean worktree does not mean clean history. Assume any secret that was ever
committed is compromised once the repository was readable by others, even
briefly.

A shallow clone only contains the commits since the graft point. Run the
history scan from a complete clone (`git fetch --unshallow` in a disposable
copy) before declaring history clean, and record how many commits were
reachable.

## Repository visibility changes

- Making a repository private does not retract forks, clones, caches, CI logs,
  or provider-side copies.
- Check for forks and collaborators before and after the change.
- If ciphertext or plaintext was public, rotate the underlying credentials and
  re-encrypt with a new key; do not rely on deletion.
- Confirm the cluster can still pull after the change: private repositories
  need a credential the controller can use.

## Deploy keys and tokens

- Use a read-only deploy key for a cluster that only pulls.
- Store the private key in a Kubernetes Secret referenced by the GitOps source.
- Pin the host key; do not disable host verification.
- Record which account or token created the deploy key. Revoking that token can
  remove the key and break reconciliation later.
- Prefer short-lived, scoped credentials over broad personal tokens.
- Rotate immediately if a key appears in a transcript, log, screenshot, or
  commit.

## Kubernetes Secret hygiene

- `stringData` is convenience only; the API stores base64, which is not
  encryption.
- Enable encryption at rest for the API server where the distribution supports
  it.
- Restrict `get/list` on Secrets with RBAC; most workloads need only their own.
- Do not mount a whole Secret when one key is needed.
- Avoid putting secrets in `env` values that appear in `kubectl describe`; a
  mounted file or an external secret store is safer.
- Deleting and recreating a Secret does not rotate anything already consumed by
  a running process; restart or reload deliberately.

## Exposure response

1. Stop the leak: revoke the token/key, make the repo private, remove the public
   route.
2. Preserve evidence: note the commit, time window, and who could read it.
3. Rotate everything the credential could reach, not just the one service.
4. Re-encrypt secrets with a new key if the old key or ciphertext was exposed.
5. Verify the old credential no longer works.
6. Record residual risk: caches, clones, and backups may still contain it.

## Verification

- encrypted files contain no plaintext values;
- decrypted hashes match the live Secrets;
- history scan is clean or the exposure is documented and rotated;
- the cluster reconciles from the private source using only in-cluster
  credentials;
- no plaintext credential appears in logs, evidence files, or command history
  that will be committed.
