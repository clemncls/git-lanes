import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./helpers.mjs";

test("simplified view preserves branches, collapses intermediate commits and groups matching refs", (t) => {
  const { git, commit, graph } = fixture(t);
  const root = commit("ROOT");
  commit("HIDDEN", "main.txt");
  git("tag", "hidden-tag");
  commit("MAIN");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("branch", "mirror-main", "HEAD");
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  git("checkout", "-b", "feature/visual", root);
  commit("FEATURE", "feature.txt");
  const checkpoint = git(
    "commit-tree",
    "HEAD^{tree}",
    "-p",
    root,
    "-m",
    "CHECKPOINT",
  );
  git("update-ref", "refs/t3/checkpoint", checkpoint);
  const text = graph(["-s"]);
  assert.match(text, /main\s+≡ origin\/main/);
  assert.match(text, /≡ mirror-main/);
  assert.match(text, /◉ feature\/visual\s+HEAD/);
  assert.match(text, /3 nodes/);
  assert.doesNotMatch(
    text,
    /ROOT|HIDDEN|MAIN|FEATURE|CHECKPOINT|hidden-tag|origin\/HEAD/,
  );
  assert.doesNotMatch(text, /\x1b|╱|╲/);
  assert.equal(graph(), graph(["-d"]));
});

test("parallel branches keep separate vertical lanes beside their branch tips", (t) => {
  const { git, commit, graph } = fixture(t);
  const root = commit("ROOT");
  git("checkout", "-b", "feature", root);
  commit("FEATURE", "feature.txt");
  git("checkout", "main");
  commit("MAIN");
  for (const args of [["-s"], ["-d"]]) {
    const body = graph(args).split(/^  ─{10,}$/m)[1];
    assert.match(body, /^(?=[^●◉◆○\n]*│)[ │]*[●◉◆○] /m);
  }
});

test("recent nodes come first while their aliases stay attached below them", (t) => {
  const { git, commit, graph } = fixture(t);
  const root = commit("OLDEST");
  git("branch", "base", root);
  const middle = commit("MIDDLE");
  git("branch", "middle", middle);
  commit("NEWEST");
  git("branch", "tip-alias", "HEAD");
  for (const args of [["-s"], ["-d"]]) {
    const body = graph(args).split(/^  ─{10,}$/m)[1];
    const labels = args[0] === "-d"
      ? ["NEWEST", "MIDDLE", "OLDEST"]
      : ["main", "middle", "base"];
    const positions = labels.map((label) => body.indexOf(label));
    assert.ok(positions.every((position) => position >= 0));
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
    assert.ok(body.indexOf("tip-alias") > positions[0]);
    assert.ok(body.indexOf("tip-alias") < positions[1]);
  }
});

test("merge parents split into separate lanes then join at their shared ancestor", (t) => {
  const { git, commit, graph } = fixture(t);
  const root = commit("ROOT");
  commit("MAIN");
  git("checkout", "-b", "feature", root);
  commit("FEATURE", "feature.txt");
  git("checkout", "main");
  git("merge", "--no-ff", "feature", "-m", "MERGE");
  const text = graph(["-s"]);
  assert.match(text, /●\s+feature/);
  assert.match(text, /3 nodes/);
  assert.doesNotMatch(text, /╱|╲/);
  const detailed = graph(["-d"]);
  assert.match(detailed, /│\s+●\s+[0-9a-f]+.*FEATURE/);
  assert.match(detailed, /MERGE/);
  assert.match(detailed, /├───╮/);
  assert.match(detailed, /(?:├───╯|╰───┤)/);
  assert.doesNotMatch(detailed, /\[1\]/);
});

test("octopus merges retain every secondary parent", (t) => {
  const { git, commit, graph } = fixture(t);
  const root = commit("ROOT");
  for (const branch of ["one", "two"]) {
    git("checkout", "-b", branch, root);
    commit(branch, `${branch}.txt`);
  }
  git("checkout", "main");
  commit("MAIN");
  git("merge", "--no-ff", "one", "two", "-m", "OCTOPUS");
  const text = graph(["-d"]);
  assert.match(text, /○\s+│\s+│\s+[0-9a-f]+\s+MAIN/);
  const body = text.split(/^  ─{10,}$/m)[1];
  assert.equal((body.match(/├[─┆]+╮/g) || []).length, 2);
  assert.equal((body.match(/├[─┆]+╯/g) || []).length, 2);
  const one = body.split("\n").find((line) => /[0-9a-f]{7}\s+one$/.test(line));
  const two = body.split("\n").find((line) => /[0-9a-f]{7}\s+two$/.test(line));
  assert.ok(one && two);
  assert.notEqual(one.indexOf("●"), two.indexOf("●"));
});

test("detailed view includes annotated tags and sanitizes terminal controls in subjects", (t) => {
  const { git, commit, graph } = fixture(t);
  commit("SUBJECT * | / \x1b[31m");
  git("tag", "-a", "v1", "-m", "Release");
  const text = graph(["--detailed", "--color", "never"]);
  assert.match(text, /SUBJECT \* \| \//);
  assert.match(text, /tag:v1/);
  assert.doesNotMatch(text, /\x1b/);
});

test("limits indicate missing ancestry, and detailed mode defaults to 30 commits", (t) => {
  const { commit, graph } = fixture(t);
  for (let index = 0; index < 32; index++) commit(`commit-${index}`);
  assert.match(graph(["-d"]), /30 commits/);
  const short = graph(["-d", "-n", "1"]);
  assert.match(short, /1 commit/);
  assert.match(short, /history limited to 1/);
  assert.match(short, /┊/);
});

test("empty repositories and detached HEAD are readable", (t) => {
  const { git, commit, graph } = fixture(t);
  assert.match(graph(), /No commits/);
  commit("FIRST");
  git("checkout", "--detach");
  assert.match(graph(), /detached HEAD/);
});

test("color modes and narrow terminals preserve names without wrapping graph edges", (t) => {
  const { git, commit, graph } = fixture(t);
  commit("ROOT");
  git("checkout", "-b", "feature/" + "very-long-name-".repeat(6));
  commit("FEATURE");
  const plain = graph([], { COLUMNS: "48" });
  assert.ok(plain.split("\n").every((line) => [...line].length <= 48));
  assert.match(plain, /↪/);
  const colored = graph(["--color", "always"], {
    COLUMNS: "48",
    NO_COLOR: "1",
  });
  assert.match(colored, /\x1b\[/);
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.doesNotMatch(graph([], { NO_COLOR: "1" }), /\x1b/);
});

test("invalid options fail with an actionable message", (t) => {
  const { run } = fixture(t);
  for (const args of [
    ["-n", "0"],
    ["-n", "-2"],
    ["-n", "1.5"],
    ["-n", "9007199254740992"],
    ["--color", "invalid"],
    ["-s", "-d"],
  ]) {
    assert.equal(run(args).status, 1, args.join(" "));
  }
  assert.equal(run(["--help"]).status, 0);
});


test("working tree lists staged, unstaged, untracked and renamed files", (t) => {
  const { cwd, git, commit, graph } = fixture(t);
  commit("ROOT");
  assert.match(graph(), /WORKING TREE  clean/);
  git("mv", "main.txt", "renamed.txt");
  writeFileSync(join(cwd, "renamed.txt"), "modified after staging");
  writeFileSync(join(cwd, "new file.txt"), "new");
  const output = graph();
  assert.match(output, /2 changed files/);
  assert.match(output, /RM  main.txt -> renamed.txt/);
  assert.match(output, /\?\?  new file.txt/);
  assert.match(output, /git-lanes --help/);
  assert.match(output, /git-lanes -s/);
});


test("--files lists uncommitted files or those changed in a commit", (t) => {
  const { cwd, git, commit, graph, run } = fixture(t);
  commit("FIRST");
  assert.match(graph(["--files", "HEAD"]), /A  main.txt/);
  git("mv", "main.txt", "renamed.txt");
  git("commit", "-m", "rename");
  writeFileSync(join(cwd, "untracked.txt"), "new content");
  const working = graph(["--files"]);
  assert.match(working, /\?\?  untracked.txt/);
  assert.doesNotMatch(working, /GIT GRAPH|new content/);
  const changed = graph(["--files", "HEAD"]);
  assert.match(changed, /R100  main.txt -> renamed.txt/);
  assert.doesNotMatch(changed, /untracked.txt/);
  assert.equal(run(["--files", "missing-ref"]).status, 1);
  assert.equal(run(["HEAD"]).status, 1);
});
