import {
  sanitizeText,
  terminalWidth,
  clipText,
  wrapLine,
} from "./terminal.mjs";

const MAX_LAYOUT_CELLS = 250000;

export function renderGraph(graph, { color = false, columns } = {}) {
  const {
    repository,
    changes = [],
    head,
    current,
    refs,
    nodes,
    limit: count,
    limited,
    detailed,
  } = graph;
  const width = terminalWidth(columns);
  const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const muted = (text) => paint("38;5;245", text);
  const clean = sanitizeText;
  const hashes = new Set(nodes.map((node) => node.hash));
  const visibleBranches = refs.filter(
    (ref) => ref.type !== "tag" && hashes.has(ref.hash),
  ).length;
  const totalBranches = refs.filter((ref) => ref.type !== "tag").length;
  const nodeUnit = detailed ? "commit" : "node";
  const nodeCount = `${nodes.length} ${nodeUnit}${nodes.length === 1 ? "" : "s"}`;
  const rule = muted("─".repeat(Math.min(width - 4, 76)));
  const output = [
    "",
    `  ${paint("1;97", "GIT GRAPH")}  ${muted("/")}  ${paint("1;97", clean(repository))}`,
    `  ${paint("1;38;5;114", "◉")} ${paint("1;38;5;114", clean(current || (head ? "detached HEAD" : "no branch")))}  ${paint("30;102", " HEAD ")}`,
    `  ${muted(`${detailed ? "COMMITS" : "BRANCHES"}  ·  newest → oldest  ·  ${visibleBranches}/${totalBranches} ${totalBranches === 1 ? "branch" : "branches"}  ·  ${nodeCount}`)}`,
    `  ${rule}`,
    "",
  ];
  function referenceLabels(node, tone) {
    const local = node.refs.filter((ref) => ref.type === "local");
    const remote = node.refs.filter((ref) => ref.type === "remote");
    const tags = node.refs.filter((ref) => ref.type === "tag");
    local.sort(
      (a, b) => Number(b.name === current) - Number(a.name === current),
    );
    const remaining = new Set(remote);
    const remoteByBranch = new Map();
    for (const ref of remote) {
      const branch = ref.name.slice(ref.name.indexOf("/") + 1);
      const matches = remoteByBranch.get(branch) || [];
      matches.push(ref);
      remoteByBranch.set(branch, matches);
    }
    const labels = local.map((ref) => {
      const matches = remoteByBranch.get(ref.name) || [];
      matches.forEach((match) => remaining.delete(match));
      const tracking = matches.length
        ? muted(`  ≡ ${matches.map((match) => clean(match.name)).join(", ")}`)
        : "";
      return (
        paint(ref.name === current ? "1;38;5;114" : "1;97", clean(ref.name)) +
        tracking
      );
    });
    for (const ref of remaining) labels.push(paint(tone, clean(ref.name)));
    for (const tag of tags)
      labels.push(paint("38;5;222", `tag:${clean(tag.name)}`));
    return labels;
  }
  function describe(node, tone, available) {
    const active = node.hash === head;
    const symbol = active
      ? "◉"
      : node.parents.length > 1
        ? "◆"
        : node.refs.length
          ? "●"
          : "○";
    const labels = referenceLabels(node, tone)[0];
    const badge = active ? `${paint("30;102", " HEAD ")} ` : "";
    let title =
      labels ||
      muted(
        node.parents.length > 1
          ? detailed
            ? "merge"
            : "junction"
          : "common ancestor",
      );
    if (detailed) {
      const summary = clipText(clean(node.subject), available);
      title = `${muted(node.hash.slice(0, 7))}  ${paint("97", summary)}`;
    }
    return { symbol, label: `${badge}${title}` };
  }
  const palette = [
    "38;5;117",
    "38;5;215",
    "38;5;183",
    "38;5;114",
    "38;5;211",
    "38;5;222",
  ];
  // Each occupied column points to a pending parent. Columns never shift sideways
  // while a branch is alive; unrelated histories can be read in parallel.
  const lanes = [];
  const laneColors = [];
  const rows = [];
  let layoutCells = 0;
  let crossings = false;
  const toneAt = (lane) => laneColors[lane] || palette[lane % palette.length];
  function allocate(hash) {
    let lane = lanes.indexOf(null);
    if (lane < 0) lane = lanes.length;
    delete laneColors[lane];
    lanes[lane] = hash;
    return lane;
  }
  function rails() {
    const size = Math.max(1, lanes.length * 4 - 3);
    layoutCells += size;
    if (layoutCells > MAX_LAYOUT_CELLS)
      throw new Error("Graph exceeds the rendering budget. Reduce -n.");
    return Array.from({ length: size }, (_, x) => ({
      glyph: x % 4 === 0 && lanes[x / 4] ? "│" : " ",
      tone: toneAt(Math.floor(x / 4)),
    }));
  }
  function connect(source, target, continues, fresh) {
    const cells = rails();
    const left = Math.min(source, target) * 4;
    const right = Math.max(source, target) * 4;
    for (let x = left + 1; x < right; x++) {
      if (cells[x].glyph === "│") {
        cells[x].glyph = "┆"; // Bridge: paths cross here without joining.
        crossings = true;
      } else cells[x] = { glyph: "─", tone: toneAt(source) };
    }
    const toRight = target > source;
    cells[source * 4] = {
      glyph: continues ? (toRight ? "├" : "┤") : toRight ? "╰" : "╯",
      tone: toneAt(source),
    };
    cells[target * 4] = {
      glyph: fresh ? (toRight ? "╮" : "╭") : toRight ? "┤" : "├",
      tone: toneAt(target),
    };
    rows.push({ cells });
  }
  for (const [index, node] of nodes.entries()) {
    let lane = lanes.indexOf(node.hash);
    if (lane < 0) lane = allocate(node.hash);
    if (node.hash === head) laneColors[lane] = "38;5;114";
    rows.push({ cells: rails(), node, lane, tone: toneAt(lane) });
    const [first, ...otherParents] = node.parents;
    const firstTarget = first ? lanes.indexOf(first) : -1;
    // Keep the source column alive until all secondary parents have been routed.
    lanes[lane] = first || null;
    const aliases = referenceLabels(node, toneAt(lane));
    for (const label of detailed ? aliases : aliases.slice(1)) {
      rows.push({
        cells: rails(),
        label: (detailed ? "" : muted("≡ ")) + label,
      });
    }
    let connected = false;
    for (const parent of otherParents) {
      let target = lanes.indexOf(parent);
      const fresh = target < 0;
      if (fresh) target = allocate(parent);
      // A newly allocated lane begins at this elbow, not above it.
      connect(lane, target, true, fresh);
      connected = true;
    }
    if (firstTarget >= 0 && firstTarget !== lane) {
      connect(lane, firstTarget, false, false);
      lanes[lane] = null;
      connected = true;
    }
    if (!connected && (lanes.some(Boolean) || index < nodes.length - 1)) {
      rows.push({ cells: lanes.some(Boolean) ? rails() : [] });
    }
  }
  if (lanes.some(Boolean)) {
    rows.push({
      cells: rails().map((cell) => ({
        ...cell,
        glyph: cell.glyph === "│" ? "┊" : cell.glyph,
      })),
    });
  }
  const graphWidth = Math.max(1, lanes.length * 4 - 3);
  for (const row of rows) {
    const cells = row.cells.slice();
    let label = row.label || "";
    if (row.node) {
      const description = describe(
        row.node,
        row.tone,
        Math.max(12, width - graphWidth - 15),
      );
      // The colored node replaces the vertical rail; its text stays in a fixed
      // label column so adding another branch never moves the existing names.
      const plainPrefix = paint(
        row.node.hash === head ? "1;38;5;114" : row.tone,
        description.symbol,
      );
      cells[row.lane * 4] = { rendered: plainPrefix };
      label = description.label;
    }
    const gutter = cells
      .map((cell) => cell.rendered || paint(cell.tone, cell.glyph))
      .join("");
    output.push(
      `  ${gutter}${" ".repeat(graphWidth - cells.length)}${label ? `   ${label}` : ""}`.trimEnd(),
    );
  }
  if (!nodes.length) output.push(`  ${muted("No commits yet.")}`);
  output.push(
    "",
    `  ${rule}`,
    `  ${muted(`◉ HEAD   ● branch   ○ ancestor   ◆ ${detailed ? "merge" : "junction"}   ≡ same commit`)}`,
  );
  if (limited)
    output.push(
      `  ${muted(`┊ history limited to ${count} ${count === 1 ? "node" : "nodes"} · increase -n to show more`)}`,
    );
  if (crossings)
    output.push(
      `  ${muted("┆ crossing without a join · ├ ┤ branch junction")}`,
    );
  output.push("", `  ${paint("1;97", "WORKING TREE")}  ${changes.length ? `${changes.length} changed ${changes.length === 1 ? "file" : "files"}` : "clean"}`);
  for (const change of changes) {
    output.push(`  ${muted(clean(change.state))}  ${change.from ? `${clean(change.from)} -> ` : ""}${clean(change.path)}`);
  }
  if (changes.length) output.push(`  ${muted("Status: index / working tree; ?? untracked ? git status for details")}`);
  output.push("", `  ${muted(`Commands: git-lanes --help | git-lanes ${detailed ? "-s" : "-d"} | git-lanes -n ${Math.min(count * 2, 10000)}`)}`, "");

  return output.map((line) => wrapLine(line, width, color)).join("\n") + "\n";
}

export function renderFiles({ changes, revision }, { columns } = {}) {
  const width = terminalWidth(columns);
  const title = revision ? `Files in commit ${sanitizeText(revision)} (relative to first parent):` : "Uncommitted files (index / working tree; ?? untracked):";
  const lines = [title];
  for (const change of changes) lines.push(`  ${sanitizeText(change.state)}  ${change.from ? `${sanitizeText(change.from)} -> ` : ""}${sanitizeText(change.path)}`);
  if (!changes.length) lines.push("  No changed files.");
  return lines.map((line) => wrapLine(line, width)).join("\n") + "\n";
}
