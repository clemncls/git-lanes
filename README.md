# git-lanes

A readable terminal Git graph with parallel branch lanes, visible junctions
and recent commits at the top. No runtime dependencies.

The default view shows branch names and collapses intermediate commits.
Use `-d` to add commit hashes, messages and tags.

## Installation

Requirements: Git on your `PATH`, Node.js 22 or later, and a terminal that
supports Unicode characters.

Run the published package without a permanent installation:

```bash
npx @clemncls/git-lanes
```

Or install it in a project:

```bash
pnpm add -D @clemncls/git-lanes
pnpm exec git-lanes
```

For a global installation:

```bash
npm install -g @clemncls/git-lanes
git-lanes
```

The package is available on [npm](https://www.npmjs.com/package/@clemncls/git-lanes).
GitHub releases remain available as an alternative:

```bash
pnpm add -D @clemncls/git-lanes@github:clemncls/git-lanes#v0.1.2
```

To run from source:

```bash
git clone https://github.com/clemncls/git-lanes.git
cd your-other-repository
node /path/to/git-lanes/bin/git-lanes.mjs
```

The graph describes the repository in the current working directory.

## Usage

```bash
git-lanes                    # Simplified view, up to 30 nodes
git-lanes -n 15              # Limit the graph to 15 nodes
git-lanes -d -n 50           # Show details for up to 50 commits
git-lanes --color always     # Force colors, even when redirected
git-lanes --color never      # Disable colors
git-lanes --help
```

After a local installation, prefix these commands with `pnpm exec`.
To add a project command:

```json
{
  "scripts": {
    "git:graph": "git-lanes"
  }
}
```

Then run `pnpm -s git:graph`. The pnpm `-s` hides its command preamble;
placing `-s` after `git:graph` explicitly selects the simplified view.

| Option | Effect |
| --- | --- |
| `-s`, `--simplified` | Simplified view, selected by default |
| `-d`, `--detailed` | Show commit hashes, messages and tags |
| `-n`, `--max-count` | Node limit: 30 by default, at most 10,000; limits commits in detailed mode |
| `--color` | `auto`, `always` or `never` |
| `-h`, `--help` | Show help |

## Reading the graph

Each live branch keeps its column until it joins another branch. Labels align
to the right of the graph; long names wrap onto additional lines.

- `◉` and the `HEAD` badge mark the current position.
- `●` marks a branch, `○` a common ancestor, and `◆` a junction or merge.
- `≡` groups references pointing to the same commit.
- `├`, `┤` and rounded elbows show connections.
- `┆` marks paths crossing without joining.
- `┊` continues ancestry beyond the selected limit.

Local and remote branches are included. Symbolic references such as
`origin/HEAD` are represented by their target; internal references, such as
tool checkpoints, are excluded as starting points.

The simplified view describes ancestry between branch positions: Git may
collapse commits and rewrite their links. Detailed mode preserves actual
commit parents. Colors are automatic, disabled when redirected or when
`NO_COLOR` is set, unless explicitly requested with `--color always`.

All built-in messages and Git subprocess diagnostics use English. Repository
metadata, including branch names and commit messages, remains in its original
language.

## Development

```bash
npm test
npm run verify:package
```

Tests create temporary repositories and cover parallel branches, multiple-parent
merges, newest-first ordering, limits, colors, long names, empty repositories,
hostile metadata and resource budgets. No dependency installation is required.

The second command builds the archive, installs it in a temporary directory and
reruns CLI and security tests against the installed package.

The CLI in `bin/` coordinates Git reading, rendering and terminal handling in
`src/`. Rendering is a pure function; repository tests also verify subprocess
arguments and resource limits.

CI covers Linux and Windows with Node.js 22 and 24. See [SECURITY.md](SECURITY.md)
for the trust model, resource budgets and security review, and
[CHANGELOG.md](CHANGELOG.md) for release history.

Visual references: [git-graph](https://github.com/git-bahn/git-graph) and
[Serie](https://github.com/lusingander/serie). The renderer is implemented here
in JavaScript, without depending on either tool or a terminal image protocol.

## License

MIT — see [LICENSE](LICENSE).
