import assert from "node:assert/strict";
import test from "node:test";
import {
  readRepository,
  GIT_TIMEOUT,
  GIT_MAX_BUFFER,
  MAX_REFS,
} from "../src/repository.mjs";
import { fixture } from "./helpers.mjs";

const head = "1".repeat(40),
  root = "2".repeat(40);
function reader(overrides = {}) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    const action = args.includes("--show-toplevel")
      ? "directory"
      : args.includes("--verify")
        ? "head"
        : args.includes("symbolic-ref")
          ? "branch"
          : args.includes("for-each-ref")
            ? "refs"
            : "log";
    if (overrides[action]) return overrides[action];
    const stdout = {
      directory: "/repositories/example\n",
      head: head + "\n",
      branch: "main\n",
      refs: [head, "", "refs/heads/main", "", "commit", ""].join("\0") + "\n",
      log:
        [head, root, "Latest"].join("\0") +
        "\n" +
        [root, "", "Root"].join("\0") +
        "\n",
    }[action];
    return { status: 0, stdout, stderr: "" };
  };
  return { calls, run };
}

test("Git runs without a shell, pager, signature verifier or optional writes, with bounded resources", () => {
  const { run, calls } = reader();
  const graph = readRepository(
    { cwd: "/repositories/example", count: 30, detailed: true },
    run,
  );
  assert.equal(graph.nodes.length, 2);
  for (const call of calls) {
    assert.equal(call.command, "git");
    assert.equal(call.options.shell, false);
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.timeout, GIT_TIMEOUT);
    assert.equal(call.options.maxBuffer, GIT_MAX_BUFFER);
    assert.equal(call.options.env.GIT_OPTIONAL_LOCKS, "0");
    assert.equal(call.options.env.LC_ALL, "C");
    assert.equal(call.options.env.LANG, "C");
    assert.ok(call.args.includes("--no-pager"));
    assert.ok(call.args.includes("core.fsmonitor=false"));
    assert.ok(call.args.includes("log.showSignature=false"));
  }
  const log = calls.find((call) => call.args.includes("log"));
  assert.ok(log.args.includes("--no-notes"));
  assert.ok(log.args.includes("--no-show-signature"));
  assert.equal(log.options.input, head + "\n");
});

test("Git timeouts, buffer exhaustion and signals produce controlled errors", () => {
  for (const [code, message] of [
    ["ETIMEDOUT", /15-second/],
    ["ENOBUFS", /8 MiB/],
    ["ENOENT", /Could not start Git/],
  ]) {
    assert.throws(
      () =>
        readRepository({ cwd: ".", count: 30 }, () => ({
          error: { code, message: "failure" },
        })),
      message,
    );
  }
  const { run } = reader({
    head: { status: null, signal: "SIGTERM", stderr: "" },
  });
  assert.throws(
    () => readRepository({ cwd: ".", count: 30 }, run),
    /read the Git repository/,
  );
});

test("unexpected Git output fails closed without echoing untrusted bytes", () => {
  const { run } = reader({
    log: { status: 0, stdout: "malformed\x1b[31m\n", stderr: "" },
  });
  assert.throws(
    () => readRepository({ cwd: ".", count: 30 }, run),
    /Unexpected format/,
  );
});

test("Git error messages are sanitized before reaching the CLI", () => {
  const { run } = reader({
    directory: {
      status: 128,
      stderr: "fatal: \x1b]52;c;payload\x07\u202eSPOOF",
    },
  });
  assert.throws(
    () => readRepository({ cwd: ".", count: 30 }, run),
    (error) =>
      !/[\x1b\u202e]/.test(error.message) && error.message.includes("SPOOF"),
  );
});

test("non-commit tags do not break detailed history", (t) => {
  const { git, commit, graph } = fixture(t);
  commit("ROOT");
  git("tag", "blob-tag", "HEAD:main.txt");
  const text = graph(["-d"]);
  assert.match(text, /ROOT/);
  assert.doesNotMatch(text, /blob-tag/);
});

test("reference and text budgets bound repository-controlled metadata", () => {
  const lines = Array.from({ length: MAX_REFS + 1 }, (_, index) =>
    [head, "", `refs/heads/b${index}`, "", "commit", ""].join("\0"),
  );
  const manyRefs = reader({
    refs: { status: 0, stdout: lines.join("\n"), stderr: "" },
  });
  assert.throws(
    () => readRepository({ cwd: ".", count: 30 }, manyRefs.run),
    /10000 references/,
  );
  const longLines = Array.from({ length: 300 }, (_, index) =>
    [
      head,
      "",
      `refs/heads/b${index}` + "a".repeat(3800),
      "",
      "commit",
      "",
    ].join("\0"),
  );
  const longRefs = reader({
    refs: { status: 0, stdout: longLines.join("\n"), stderr: "" },
  });
  assert.throws(
    () => readRepository({ cwd: ".", count: 30 }, longRefs.run),
    /text budget/,
  );
});

test("configured notes and signature verification cannot change the machine-readable log", (t) => {
  const { git, commit, graph } = fixture(t);
  commit("ROOT");
  git("notes", "add", "-m", "NOTE_NOT_A_COMMIT");
  git("config", "notes.displayRef", "refs/notes/commits");
  git("config", "log.showSignature", "true");
  git("config", "gpg.program", "missing-gpg-program");
  const text = graph(["-d"]);
  assert.match(text, /ROOT/);
  assert.doesNotMatch(text, /NOTE_NOT_A_COMMIT/);
});
