---
name: email-access
description: Obtain and verify IMAP access without a browser, covering app passwords, secret-tool storage, TLS endpoints, and login failure modes.
tags: "email,imap,credentials,tls,providers"
---

# Access

Read this file before connecting, storing a secret, or diagnosing a login
failure. Read [`safety.md`](safety.md) before handling any credential.

## Transport choice

Use IMAP through Python's stdlib `imaplib`. Only IMAP is implemented; this
bundle has no provider REST client. Do not drive a browser to sign in to hosted
mail.

A hosted-mail provider that rejects automated browsers will refuse sign-in from
an automation profile. The observed result is a sign-in rejection page such as
"This browser or app may not be secure". Retrying, clearing the profile,
spoofing the user agent, or adding launch flags does not fix it. The decision is
provider-side risk control, not a missing flag. Stop the browser path, use
IMAP, or ask the user to authenticate interactively outside automation.

## Prerequisites

| Requirement | Why it matters |
| --- | --- |
| Two-factor authentication enabled | Most providers require it before an app password can be issued. |
| App password | The account password is usually rejected for IMAP, and may be blocked outright. OAuth2 is not implemented by these scripts. |
| IMAP enabled for the account | Some providers disable IMAP by default; Workspace or tenant policy can forbid it. |
| `secret-tool` on `PATH` | Stores the secret outside the repository, chat, and shell history. |
| Outbound TLS to the IMAP port | Port 993 is the default; port 143 requires `--starttls`. |

If IMAP is disabled or admin-blocked, report that blocker. Do not switch to a
browser or to a plaintext port.

## Endpoints

| Provider | Endpoint | Authentication |
| --- | --- | --- |
| Google mail / Workspace | `imap.gmail.com:993` | App password with 2FA. |
| Generic IMAP | `IMAP_HOST:993` | Provider-issued app password. |
| STARTTLS fallback | `IMAP_HOST:143` with `--starttls` | Provider-issued app password. |

Port 993 is implicit TLS. Use port 143 with `--starttls` only when 993 is
unreachable and the server advertises `STARTTLS`. Verify certificates against
the system trust store. Never set `ssl.CERT_NONE` or disable hostname checks to
make a connection succeed.

Microsoft 365 normally requires OAuth2. These scripts do not implement it, so
that account type is unsupported without extending the code.

## Secret handling

Store the secret once with `secret-tool`; the prompt does not echo it:

```bash
secret-tool store --label="IMAP USER@example.com" service imap user USER@example.com
```

The scripts look it up exactly as:

```bash
secret-tool lookup service imap user USER@example.com
```

Resolution order in `mail_common.py`:

| Order | Source | Notes |
| --- | --- | --- |
| 1 | `--password-stdin` | Reads one line from stdin. Preferred for scripted runs. |
| 2 | `--password-env VAR` | Named variable; fails if unset. |
| 3 | `EMAIL_APP_PASSWORD` | Fixed environment fallback. |
| 4 | `secret-tool lookup service imap user USER@example.com` | Preferred interactive setup. |

Rules:

- Never pass a secret as a command-line argument; it appears in process lists
  and shell history.
- Never put a secret in a repository file, task memory, chat message, screenshot,
  or log.
- Prefer `secret-tool` or `--password-stdin`; environment variables leak to
  child processes and `/proc`.
- If an interactive prompt is required, use `getpass`, not `input`.
- Use a temporary app password for one automation task, then have the user
  revoke it. If it was exposed, tell the user to revoke and rotate it.

## Read-only login check

Verify before enumerating or mutating. Select the mailbox read-only so the check
cannot change flags.

```python
import imaplib
import subprocess

secret = subprocess.run(
    ["secret-tool", "lookup", "service", "imap", "user", "USER@example.com"],
    capture_output=True, text=True, check=True,
).stdout.strip()

conn = imaplib.IMAP4_SSL("imap.gmail.com", 993)
try:
    conn.login("USER@example.com", secret)
    typ, caps = conn.capability()
    print("capabilities:", [c.decode() for c in caps[0].split()])
    typ, _ = conn.select("INBOX", readonly=True)    # EXAMINE, no writes
    typ, data = conn.uid("SEARCH", None, "ALL")
    print("inbox messages:", len(data[0].split()))
finally:
    try:
        conn.logout()
    except Exception:
        pass
```

A passing check means TLS, credentials, and mailbox access work. It does not
authorize a mutation. Record the capability string for the discovery phase.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `[AUTHENTICATIONFAILED] Invalid credentials` | Wrong or expired app password, 2FA off, IMAP disabled, or OAuth required. | Reissue an app password or enable IMAP; OAuth accounts are unsupported. |
| `[ALERT] Application-specific password required` | Account password used instead of an app password. | Create an app password after enabling 2FA. |
| `LOGIN failed` repeated, then temporary lock | Too many attempts or concurrent clients. | Stop retrying, close other clients, wait, then retry once. |
| `Too many simultaneous connections` | Parallel workers exceed the account limit. | Reduce concurrency to one connection per account. |
| `SSLCertVerificationError` | Wrong hostname, proxy interception, or stale CA store. | Correct the host and system trust; never disable verification. |
| Connection timeout or refused | Port 993 blocked or host offline. | Try port 143 with `--starttls` or another network; do not downgrade to plaintext. |
| Provider disables "less secure apps" | Modern auth is required. | Use an app password; never enable less-secure access. |
| Browser rejection page | Automation profile refused by the provider. | Stop the browser path; use IMAP. |
| `secret-tool` returns nothing | No entry for `service imap user <account>`. | Run the store command again with the exact account string. |
| `BYE` after a long fetch | Idle timeout or rate limit. | Reconnect, resume from the last completed UID, add backoff. |

Do not paste the failing command with a secret into a report. Redact the account
and any token material.

## Authentication scope

- These scripts support app-password IMAP only.
- OAuth2, provider REST APIs, token refresh, and device-code flows are not
  implemented.
- If the account requires OAuth2, report it as a blocker instead of improvising
  a browser login.
