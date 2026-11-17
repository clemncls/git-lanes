import { parseArgs } from "node:util";

export const MAX_COUNT = 10000;
export const HELP = `Usage: git-lanes [-d] [-n <count>]

A Git graph with parallel lanes, newest commits first.
Default: branch names only, with intermediate commits collapsed.
Parallel branches and their junctions remain visible side by side.

Options:
  -d, --detailed          Show commit hashes, messages and tags
  -s, --simplified        Simplified view (default)
  -n, --max-count <count> Node limit (default: 30, maximum: ${MAX_COUNT})
      --color <mode>      auto (default), always or never
  -h, --help              Show this help

Examples:
  git-lanes
  git-lanes -n 15
  git-lanes -d -n 50
  git-lanes --color always`;

export function parseOptions(args) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        "max-count": { type: "string", short: "n", default: "30" },
        detailed: { type: "boolean", short: "d", default: false },
        simplified: { type: "boolean", short: "s", default: false },
        color: { type: "string", default: "auto" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    throw new Error(`${error.message}\n\n${HELP}`);
  }
  if (values.help) return { help: true };
  const count = Number(values["max-count"]);
  if (
    !/^[1-9]\d*$/.test(values["max-count"]) ||
    !Number.isSafeInteger(count) ||
    count > MAX_COUNT
  ) {
    throw new Error(
      `Node count must be an integer between 1 and ${MAX_COUNT}.`,
    );
  }
  if (!["auto", "always", "never"].includes(values.color))
    throw new Error("--color must be auto, always or never.");
  if (values.detailed && values.simplified)
    throw new Error("Choose either -d or -s, not both.");
  return { help: false, count, detailed: values.detailed, color: values.color };
}
