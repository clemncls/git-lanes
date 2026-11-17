import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const parent = resolve(tmpdir());
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check with npm run verify:package.");
const workspace = mkdtempSync(join(parent, "git-lanes-package-"));
const runNpm = (args, options = {}) =>
  execFileSync(process.execPath, [npm, ...args], {
    cwd: repository,
    encoding: "utf8",
    ...options,
  });
try {
  const [archive] = JSON.parse(
    runNpm([
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      workspace,
    ]),
  );
  const tarball = resolve(workspace, archive.filename);
  assert.equal(dirname(tarball), workspace);
  const files = archive.files.map((file) => file.path);
  assert.ok(files.includes("src/repository.mjs"));
  assert.ok(files.includes("src/render.mjs"));
  assert.ok(
    !files.some(
      (file) => file.startsWith("test/") || file.startsWith(".github/"),
    ),
  );
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({ name: "git-lanes-package-check", private: true }),
  );
  runNpm([
    "install",
    "--prefix",
    workspace,
    "--ignore-scripts",
    "--no-package-lock",
    "--no-audit",
    "--no-fund",
    tarball,
  ]);
  const installed = join(
    workspace,
    "node_modules",
    "@clemncls",
    "git-lanes",
    "bin",
    "git-lanes.mjs",
  );
  execFileSync(
    process.execPath,
    ["--test", "test/git-lanes.test.mjs", "test/security.test.mjs"],
    {
      cwd: repository,
      stdio: "inherit",
      env: { ...process.env, GIT_LANES_TEST_BIN: installed },
    },
  );
  console.log("Installed archive: CLI and security tests passed.");
} finally {
  assert.equal(dirname(resolve(workspace)), parent);
  assert.ok(workspace.startsWith(join(parent, "git-lanes-package-")));
  rmSync(workspace, { recursive: true, force: true });
}
