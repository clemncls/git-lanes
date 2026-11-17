import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { sanitizeText, MAX_TEXT_LENGTH } from "./terminal.mjs";

export const GIT_TIMEOUT = 15000;
export const GIT_MAX_BUFFER = 8 * 1024 * 1024;
export const MAX_REFS = 10000;
export const MAX_METADATA = 1000000;
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export function readRepository({ cwd, count, detailed }, run = spawnSync) {
  let metadata = 0;
  function text(value) {
    const safe = sanitizeText(value);
    metadata += safe.length;
    if (metadata > MAX_METADATA)
      throw new Error(
        "Git metadata exceeds the text budget. Reduce -n or the number of references.",
      );
    return safe;
  }
  function git(args, { optional = false, input } = {}) {
    const result = run(
      "git",
      [
        "--no-pager",
        "-c",
        "log.showSignature=false",
        "-c",
        "core.fsmonitor=false",
        ...args,
      ],
      {
        cwd,
        input,
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
          LANG: "C",
        },
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: GIT_TIMEOUT,
        maxBuffer: GIT_MAX_BUFFER,
      },
    );
    if (result.error) {
      if (result.error.code === "ETIMEDOUT")
        throw new Error("Git exceeded the 15-second timeout.");
      if (result.error.code === "ENOBUFS")
        throw new Error(
          "Git output exceeds the 8 MiB limit. Reduce -n or the number of references.",
        );
      throw new Error(
        `Could not start Git: ${sanitizeText(result.error.message)}`,
      );
    }
    if (result.status !== 0) {
      // Optional queries may have no answer (an unborn or detached HEAD), but
      // process failures and signals must never be mistaken for an empty repo.
      if (optional && result.status === 1) return "";
      throw new Error(
        sanitizeText(result.stderr).trim() ||
          "Could not read the Git repository.",
      );
    }
    return result.stdout.trimEnd();
  }
  const repository = text(basename(git(["rev-parse", "--show-toplevel"])));
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"], {
    optional: true,
  });
  if (head && !objectId.test(head))
    throw new Error("Invalid HEAD object ID in Git output.");
  const current = text(
    git(["symbolic-ref", "--quiet", "--short", "HEAD"], { optional: true }),
  );
  const refs = [];
  const refsByHash = new Map();
  const refOutput = git([
    "for-each-ref",
    "--format=%(objectname)%00%(*objectname)%00%(refname)%00%(symref)%00%(objecttype)%00%(*objecttype)",
    "refs/heads",
    "refs/remotes",
    ...(detailed ? ["refs/tags"] : []),
  ]);
  let referencesRead = 0;
  for (const line of refOutput ? refOutput.split("\n") : []) {
    if (++referencesRead > MAX_REFS)
      throw new Error(
        `Repository exceeds the limit of ${MAX_REFS} references.`,
      );
    const [object, peeled, ref, symbolic, type, peeledType] = line.split("\0");
    if (
      !objectId.test(object) ||
      !ref?.match(/^refs\/(heads|remotes|tags)\//) ||
      ref.length > MAX_TEXT_LENGTH
    )
      throw new Error("Invalid or oversized reference in Git output.");
    if (symbolic || (peeled ? peeledType : type) !== "commit") continue;
    const hash = peeled || object;
    if (!objectId.test(hash))
      throw new Error("Invalid reference object ID in Git output.");
    const item = {
      hash,
      type: ref.startsWith("refs/heads/")
        ? "local"
        : ref.startsWith("refs/remotes/")
          ? "remote"
          : "tag",
      name: text(ref.replace(/^refs\/(heads|remotes|tags)\//, "")),
    };
    refs.push(item);
    const bucket = refsByHash.get(hash) || [];
    bucket.push(item);
    refsByHash.set(hash, bucket);
  }
  // Pass only validated commit IDs on stdin, rather than letting non-commit tags
  // or repository-controlled reference text become revision arguments.
  const revisions = [
    ...new Set([head, ...refs.map((ref) => ref.hash)].filter(Boolean)),
  ];
  const raw = revisions.length
    ? git(
        [
          "log",
          "--no-color",
          "--no-notes",
          "--no-show-signature",
          "--date-order",
          "--format=%H%x00%P%x00%s",
          `--max-count=${count + 1}`,
          ...(!detailed
            ? [
                "--simplify-by-decoration",
                "--full-history",
                "--decorate-refs=HEAD",
                "--decorate-refs=refs/heads/*",
                "--decorate-refs=refs/remotes/*",
                "--decorate-refs-exclude=refs/remotes/*/HEAD",
              ]
            : []),
          "--stdin",
          "--",
        ],
        { input: revisions.join("\n") + "\n" },
      )
    : "";
  const records = (raw ? raw.split("\n") : []).map((line) => {
    const fields = line.split("\0");
    const [hash, parentText, subject] = fields;
    const parents = parentText ? parentText.split(" ") : [];
    if (
      fields.length !== 3 ||
      !objectId.test(hash) ||
      parents.some((parent) => !objectId.test(parent))
    )
      throw new Error("Unexpected format in Git output.");
    return {
      hash,
      parents,
      subject: text(subject),
      refs: refsByHash.get(hash) || [],
    };
  });
  return {
    repository,
    head,
    current,
    refs,
    nodes: records.slice(0, count),
    limited: records.length > count,
    limit: count,
    detailed,
  };
}
