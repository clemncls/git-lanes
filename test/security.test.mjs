import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import test from "node:test";
import { fixture, script } from "./helpers.mjs";

test("untrusted Git metadata cannot control the terminal or reverse its text", (t) => {
  const { git, commit, graph } = fixture(t);
  commit("message \x1b]52;c;YXR0YWNr\x07 \u202eREVERSED\u2069");
  git("branch", "feature/\u202eSPOOF\u2069");
  const text = graph(["-d", "--color", "never"]);
  assert.doesNotMatch(text, /[\x1b\x07\u202e\u2069]/);
  assert.match(text, /REVERSED/);
});

test("Git errors and argument errors cannot inject terminal escapes", (t) => {
  const { run, cwd } = fixture(t);
  const gitError = run([], { GIT_DIR: join(cwd, "missing-\x1b[31m") });
  assert.equal(gitError.status, 1);
  assert.doesNotMatch(gitError.stderr, /\x1b/);
  const argumentError = run(["--unknown-\x1b[31m"]);
  assert.equal(argumentError.status, 1);
  assert.doesNotMatch(argumentError.stderr, /\x1b/);
});

test("very large requests are rejected before reading the repository", (t) => {
  const { run } = fixture(t);
  const result = run(["-n", "10001"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /10000/);
});

test("closing a downstream pipe exits quietly without a stack trace", async (t) => {
  const { cwd, commit } = fixture(t);
  commit("ROOT");
  const child = spawn(process.execPath, [script], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.destroy();
  const [code] = await once(child, "exit");
  assert.equal(code, 0, stderr);
  assert.equal(stderr, "");
});
