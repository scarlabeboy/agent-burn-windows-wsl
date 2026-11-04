# Contributing to Agent Burn for Windows

Thanks for helping. This fork is maintained by one person, so short and concrete reports are
the most useful.

## Reporting a bug

Open a [bug report](https://github.com/scarlabeboy/agent-burn-windows-wsl/issues/new/choose)
and give:

- the app version (bottom right of the window) and your Windows version;
- whether it happens on Windows, in WSL, or both, and which harnesses are involved;
- what you did, what you expected, and what happened, with a screenshot if you can.

**Never paste tokens or credential files** (`.credentials.json`, `auth.json`): no report needs
them. For a security problem, do not open an issue: see [SECURITY](SECURITY.md).

## Suggesting an idea

Open an idea or feature request and say what you would like and why. Ideas are weighed
against what they add to maintain, so some may be declined.

## Pull requests

Open an issue first, so we can agree on the change before you spend time on it.

- The Windows app lives in [`desktop/`](../desktop/README.md); its rules for code and tests
  are in [`desktop/AGENTS.md`](../desktop/AGENTS.md).
- Everything outside `desktop/` is [Melvynx's Agent Burn](https://github.com/Melvynx/agent-burn),
  kept in sync with upstream. A change to the CLI itself belongs there, in his repository,
  which has its own [contributing guide](../CONTRIBUTING.md).
- Using AI tools is fine, as long as you understand and have tested what you submit.
