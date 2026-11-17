# Changelog

## 0.1.2 — 2026-11-17

- Translate all CLI help, errors, graph labels, documentation and test assertions into English.
- Use the C locale for Git subprocess diagnostics.
- Preserve Unicode fixtures and repository metadata in their original language.
- Keep existing flags, defaults and security limits unchanged.

## 0.1.1 — 2026-11-17

- Separate the CLI, Git reading, rendering and terminal handling.
- Filter terminal controls and error output; expose bidirectional and invisible
  Unicode controls as visible escapes.
- Add explicit Git, reference, metadata and graph resource budgets.
- Use fixed Git arguments and validated revisions on stdin, without a shell,
  notes, pager, file monitoring or signature verification.
- Ignore tags pointing to non-commit objects without breaking the graph.
- Index references when grouping them; fix colors when reusing columns.
- Wrap wide characters and combined graphemes correctly.
- Handle closed downstream pipes without an `EPIPE` stack trace.
- Add security tests, Git-independent rendering tests and Linux/Windows CI
  with Node.js 22 and 24.
- Document the security policy and review in [SECURITY.md](SECURITY.md).

## 0.1.0 — 2026-11-17

- Initial release: terminal graph with persistent columns, a simplified default
  view, details with `-d`, and a configurable limit with `-n`.
