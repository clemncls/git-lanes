#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { parseArgs, stripVTControlCharacters } from "node:util";

const help = `Usage : git-lanes [-d] [-n <nombre>]

Un graphe Git en colonnes, du récent vers l'ancien.
Par défaut : branches seules, commits intermédiaires repliés.
Les branches parallèles et leurs jonctions restent visibles côte à côte.

Options :
  -d, --detailed           Ajouter les hashes, messages de commits et tags
  -s, --simplified         Vue simplifiée (défaut)
  -n, --max-count <nombre> Limite de nœuds (défaut : 30)
      --color <mode>       auto (défaut), always ou never
  -h, --help               Afficher cette aide

Exemples :
  git-lanes
  git-lanes -n 15
  git-lanes -d -n 50
  git-lanes --color always`;

function fail(message) {
  console.error(message);
  process.exit(1);
}
let values;
try {
  ({ values } = parseArgs({
    options: {
      "max-count": { type: "string", short: "n", default: "30" },
      detailed: { type: "boolean", short: "d" },
      simplified: { type: "boolean", short: "s" },
      color: { type: "string", default: "auto" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (error) {
  fail(`${error.message}\n\n${help}`);
}
if (values.help) {
  console.log(help);
  process.exit(0);
}
const count = Number(values["max-count"]);
if (!/^[1-9]\d*$/.test(values["max-count"]) || !Number.isSafeInteger(count)) {
  fail("Le nombre de nœuds doit être un entier strictement positif.");
}
if (!["auto", "always", "never"].includes(values.color)) {
  fail("--color attend auto, always ou never.");
}
if (values.detailed && values.simplified)
  fail("Choisir -d ou -s, une seule vue à la fois.");

const color =
  values.color === "always" ||
  (values.color === "auto" &&
    process.stdout.isTTY &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== "dumb");
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const muted = (text) => paint("38;5;245", text);
const clean = (text) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
const width = Math.max(
  40,
  process.stdout.columns || Number(process.env.COLUMNS) || 100,
);
const length = (text) => [...stripVTControlCharacters(text)].length;

function git(args, optional = false) {
  const result = spawnSync(
    "git",
    ["--no-pager", "-c", "log.showSignature=false", ...args],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) fail(`Impossible de lancer Git : ${result.error.message}`);
  if (result.status !== 0 && !optional)
    fail(result.stderr.trim() || "La lecture du dépôt Git a échoué.");
  return result.status === 0 ? result.stdout.trimEnd() : "";
}
const repository = basename(git(["rev-parse", "--show-toplevel"]));
const head = git(["rev-parse", "--verify", "--quiet", "HEAD"], true);
const current = git(["symbolic-ref", "--quiet", "--short", "HEAD"], true);
const refs = git([
  "for-each-ref",
  "--format=%(objectname)%00%(*objectname)%00%(refname)%00%(symref)",
  "refs/heads",
  "refs/remotes",
  ...(values.detailed ? ["refs/tags"] : []),
])
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    const [object, peeled, ref, symbolic] = line.split("\0");
    if (symbolic) return [];
    const type = ref.startsWith("refs/heads/")
      ? "local"
      : ref.startsWith("refs/remotes/")
        ? "remote"
        : "tag";
    return [
      {
        hash: peeled || object,
        type,
        name: ref.replace(/^refs\/(heads|remotes|tags)\//, ""),
      },
    ];
  });
const raw = head
  ? git([
      "log",
      "--no-color",
      "--date-order",
      "--format=%H%x00%P%x00%s",
      `--max-count=${count + 1}`,
      ...(values.detailed
        ? ["--tags"]
        : [
            "--simplify-by-decoration",
            "--full-history",
            "--decorate-refs=HEAD",
            "--decorate-refs=refs/heads/*",
            "--decorate-refs=refs/remotes/*",
            "--decorate-refs-exclude=refs/remotes/*/HEAD",
          ]),
      "--branches",
      "--remotes",
      "HEAD",
      "--",
    ])
  : "";
const records = (raw ? raw.split("\n") : []).map((line) => {
  const [hash, parents, subject] = line.split("\0");
  return {
    hash,
    parents: parents ? parents.split(" ") : [],
    subject: clean(subject),
    refs: refs.filter((ref) => ref.hash === hash),
  };
});
const limited = records.length > count;
const nodes = records.slice(0, count);
const hashes = new Set(nodes.map((node) => node.hash));
const visibleBranches = refs.filter(
  (ref) => ref.type !== "tag" && hashes.has(ref.hash),
).length;
const totalBranches = refs.filter((ref) => ref.type !== "tag").length;
const rule = muted("─".repeat(Math.min(width - 4, 76)));
const output = [
  "",
  `  ${paint("1;97", "GIT GRAPH")}  ${muted("/")}  ${paint("1;97", clean(repository))}`,
  `  ${paint("1;38;5;114", "◉")} ${paint("1;38;5;114", clean(current || (head ? "HEAD détachée" : "aucune branche")))}  ${paint("30;102", " HEAD ")}`,
  `  ${muted(`${values.detailed ? "COMMITS" : "BRANCHES"}  ·  récent → ancien  ·  ${visibleBranches}/${totalBranches} branches  ·  ${nodes.length} ${values.detailed ? "commits" : "repères"}`)}`,
  `  ${rule}`,
  "",
];
function referenceLabels(node, tone) {
  const local = node.refs.filter((ref) => ref.type === "local");
  const remote = node.refs.filter((ref) => ref.type === "remote");
  const tags = node.refs.filter((ref) => ref.type === "tag");
  local.sort((a, b) => Number(b.name === current) - Number(a.name === current));
  const remaining = new Set(remote);
  const labels = local.map((ref) => {
    const matches = remote.filter(
      (candidate) =>
        candidate.name.slice(candidate.name.indexOf("/") + 1) === ref.name,
    );
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
        ? values.detailed
          ? "fusion"
          : "jonction"
        : "ancêtre commun",
    );
  if (values.detailed) {
    const subject = [...node.subject];
    const summary =
      subject.length > available
        ? subject.slice(0, available - 1).join("") + "…"
        : node.subject;
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
let crossings = false;
const toneAt = (lane) => laneColors[lane] || palette[lane % palette.length];
function allocate(hash) {
  let lane = lanes.indexOf(null);
  if (lane < 0) lane = lanes.length;
  lanes[lane] = hash;
  return lane;
}
function rails() {
  return Array.from({ length: Math.max(1, lanes.length * 4 - 3) }, (_, x) => ({
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
  rows.push({ cells: rails(), node, lane });
  const [first, ...otherParents] = node.parents;
  const firstTarget = first ? lanes.indexOf(first) : -1;
  // Keep the source column alive until all secondary parents have been routed.
  lanes[lane] = first || null;
  const aliases = referenceLabels(node, toneAt(lane));
  for (const label of values.detailed ? aliases : aliases.slice(1)) {
    rows.push({
      cells: rails(),
      label: (values.detailed ? "" : muted("≡ ")) + label,
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
      toneAt(row.lane),
      Math.max(12, width - graphWidth - 15),
    );
    // The colored node replaces the vertical rail; its text stays in a fixed
    // label column so adding another branch never moves the existing names.
    const plainPrefix = paint(
      row.node.hash === head ? "1;38;5;114" : toneAt(row.lane),
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
if (!nodes.length) output.push(`  ${muted("Aucun commit pour le moment.")}`);
output.push(
  "",
  `  ${rule}`,
  `  ${muted(`◉ HEAD   ● branche   ○ ancêtre   ◆ ${values.detailed ? "fusion" : "jonction"}   ≡ même commit`)}`,
);
if (limited)
  output.push(
    `  ${muted(`┊ historique limité à ${count} nœuds · augmenter -n pour élargir`)}`,
  );
if (crossings)
  output.push(
    `  ${muted("┆ croisement sans jonction · ├ ┤ jonction de branches")}`,
  );
output.push("");

// Wrap names instead of cutting them off or letting the terminal split a tree
// line into what looks like a new edge. Reapply the active color after a wrap.
function wrap(line) {
  if (length(line) <= width) return line;
  let result = "",
    column = 0,
    active = "";
  const nextLine = () => {
    result += `${color ? "\x1b[0m" : ""}\n${muted("    ↪ ")}${active}`;
    column = 6;
  };
  const words = line.match(/(?:\x1b\[[0-9;]*m|[^\s\x1b])+|[ \t]+/gu) || [];
  for (const word of words) {
    if (word.trim() && column > 6 && column + length(word) > width - 1)
      nextLine();
    for (const token of word.match(/\x1b\[[0-9;]*m|[^\x1b]/gu) || []) {
      if (token.startsWith("\x1b")) {
        active = token === "\x1b[0m" ? "" : token;
      } else {
        if (column >= width - 1) nextLine();
        column++;
      }
      result += token;
    }
  }
  return result;
}
process.stdout.write(output.map(wrap).join("\n") + "\n");
