#!/usr/bin/env node
import { HELP, parseOptions } from "../src/options.mjs";
import { readRepository } from "../src/repository.mjs";
import { renderGraph, renderFiles } from "../src/render.mjs";
import { sanitizeText } from "../src/terminal.mjs";

function report(error) {
  process.exitCode = 1;
  const message = String(error.message || error)
    .split("\n")
    .map(sanitizeText)
    .join("\n");
  process.stderr.write(message + "\n");
}
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exitCode = 0;
  else report(error);
});
process.stderr.on("error", () => {
  process.exitCode = 1;
});
try {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) process.stdout.write(HELP + "\n");
  else {
    const graph = readRepository({ ...options, cwd: process.cwd() });
    const color =
      options.color === "always" ||
      (options.color === "auto" &&
        process.stdout.isTTY &&
        process.env.NO_COLOR === undefined &&
        process.env.TERM !== "dumb");
    process.stdout.write(
      (options.files ? renderFiles : renderGraph)(graph, {
        color,
        columns: process.stdout.columns || process.env.COLUMNS,
      }),
    );
  }
} catch (error) {
  report(error);
}
