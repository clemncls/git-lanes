# Security

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/clemncls/git-lanes/security/advisories/new)
to report a vulnerability. Keep sensitive details out of public issues.
Fixes are released in the latest version of the `0.1.x` series.

## Trust model

The CLI reads the current repository and prints text. It does not write Git
data, make network requests or install packages. Node.js, the `git` executable
on your `PATH`, the operating system and the runtime environment must be trusted
and kept up to date. The tool is not a sandbox for a compromised Git executable
or machine.

Commit messages, reference names and errors are treated as untrusted data:
ANSI/OSC sequences are removed, control characters and line separators are
neutralized, and bidirectional/invisible controls are exposed as `\uXXXX`.
Only the renderer generates colors. This does not detect every Unicode
homograph or account for every terminal font's character widths.

Git is launched with an argument array, without a shell, pager, notes or
signature verification. File monitoring and optional locks are disabled.
Revisions are validated commit IDs passed through stdin; tags pointing to
non-commit objects are not traversed. Git subprocesses use the C locale for
English diagnostics. See the contracts for [Git log](https://git-scm.com/docs/git-log)
and [Node.js child_process](https://nodejs.org/api/child_process.html).

## Resource limits

| Resource | Limit |
| --- | --- |
| Git request | 15 seconds per subprocess |
| Git subprocess output | 8 MiB per stream |
| Nodes requested with `-n` | 10,000, with a default of 30 |
| References read | 10,000 |
| Display field | 4,096 characters, with an ellipsis when truncated |
| Combined displayable metadata | 1,000,000 characters |
| Graph canvas | 250,000 cells |
| Effective terminal width | 40 to 240 columns |

Requests exceeding these budgets produce a controlled error without an internal
stack trace. These limits bound CLI work; they do not replace operating-system
memory and CPU limits. Invalid Git configuration can still prevent repository
reading and will be reported.

## Security review: November 17, 2026

Scope: source code, package configuration, installable archive, Git subprocesses,
terminal output and GitHub settings. This was a code review with regression
tests, not a certification or an audit of Git or Node.js.

| Finding in version 0.1.0 | Resolution in 0.1.1 |
| --- | --- |
| Argument errors printed without terminal filtering | Filter every error output path |
| Bidirectional controls preserved in names and messages | Display Unicode controls as visible escapes |
| No Git timeout, node maximum or rendering budget | Explicit limits and controlled errors |
| A closed downstream pipe produced an `EPIPE` stack trace | Quiet, successful exit |
| Nested searches when grouping references | Index references by commit and branch name |

No shell invocation or runtime dependency was identified in the package.
The GitHub check reported secret scanning and push protection enabled, with no
alerts returned on that date. This does not guarantee the absence of secrets
or undetected vulnerabilities.

CI runs tests on Linux and Windows with Node.js 22 and 24. Actions are pinned
to commit SHAs, the token has read-only contents access, and checkout credentials
are not persisted.
