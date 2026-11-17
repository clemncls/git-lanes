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
        "Les métadonnées Git dépassent le budget de texte. Réduire -n ou le nombre de références.",
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
        throw new Error("Git a dépassé le délai de 15 secondes.");
      if (result.error.code === "ENOBUFS")
        throw new Error(
          "La sortie Git dépasse la limite de 8 Mio. Réduire -n ou le nombre de références.",
        );
      throw new Error(
        `Impossible de lancer Git : ${sanitizeText(result.error.message)}`,
      );
    }
    if (result.status !== 0) {
      // Optional queries may have no answer (an unborn or detached HEAD), but
      // process failures and signals must never be mistaken for an empty repo.
      if (optional && result.status === 1) return "";
      throw new Error(
        sanitizeText(result.stderr).trim() ||
          "La lecture du dépôt Git a échoué.",
      );
    }
    return result.stdout.trimEnd();
  }
  const repository = text(basename(git(["rev-parse", "--show-toplevel"])));
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"], {
    optional: true,
  });
  if (head && !objectId.test(head))
    throw new Error("Identifiant HEAD invalide dans la sortie Git.");
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
      throw new Error(`Le dépôt dépasse la limite de ${MAX_REFS} références.`);
    const [object, peeled, ref, symbolic, type, peeledType] = line.split("\0");
    if (
      !objectId.test(object) ||
      !ref?.match(/^refs\/(heads|remotes|tags)\//) ||
      ref.length > MAX_TEXT_LENGTH
    )
      throw new Error("Référence invalide ou trop longue dans la sortie Git.");
    if (symbolic || (peeled ? peeledType : type) !== "commit") continue;
    const hash = peeled || object;
    if (!objectId.test(hash))
      throw new Error("Identifiant de référence invalide dans la sortie Git.");
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
      throw new Error("Format inattendu dans la sortie Git.");
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
