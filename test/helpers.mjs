import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const script =
  process.env.GIT_LANES_TEST_BIN ||
  fileURLToPath(new URL("../bin/git-lanes.mjs", import.meta.url));
export function fixture(t) {
  const parent = resolve(tmpdir());
  const cwd = mkdtempSync(join(parent, "git-lanes-test-"));
  t.after(() => {
    assert.equal(dirname(resolve(cwd)), parent);
    assert.ok(cwd.startsWith(join(parent, "git-lanes-test-")));
    rmSync(cwd, { recursive: true, force: true });
  });
  let commandIndex = 0;
  const git = (...args) => {
    const date = new Date(
      Date.UTC(2020, 0, 1) + commandIndex++ * 1000,
    ).toISOString();
    return execFileSync(
      "git",
      [
        "-c",
        "user.name=Graph Test",
        "-c",
        "user.email=graph@example.test",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        ...args,
      ],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      },
    ).trim();
  };
  git("init", "-b", "main");
  const commit = (message, file = "main.txt") => {
    writeFileSync(join(cwd, file), message);
    git("add", file);
    git("commit", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const run = (args = [], env = {}) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, COLUMNS: "100", ...env },
    });
  const graph = (args = [], env = {}) => {
    const result = run(args, env);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  return { cwd, git, commit, run, graph };
}
