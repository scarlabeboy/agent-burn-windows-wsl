# Security policy

Agent Burn for Windows reads local usage logs and the sign-ins your coding agents already
stored, so a security problem in it matters. Thanks for reporting one privately.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/scarlabeboy/agent-burn-windows-wsl/security/advisories/new)
(also under the repository's **Security** tab).

Describe what you found, how to reproduce it, and the app version. Never include real tokens
or credential files. You will get an answer as soon as possible; this fork is maintained by
one person.

## Supported versions

Only the latest release gets fixes. The app updates itself, so staying on the latest version
is the way to get them.

## Scope

- The Windows app in `desktop/`, its installer and its updates: report here.
- The Agent Burn CLI in `rust/` comes from
  [Melvynx/agent-burn](https://github.com/Melvynx/agent-burn). A problem in it can be reported
  here too: it will be fixed in this fork when it affects the app, and passed on upstream.
