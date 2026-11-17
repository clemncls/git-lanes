import { parseArgs } from "node:util";

export const MAX_COUNT = 10000;
export const HELP = `Usage : git-lanes [-d] [-n <nombre>]

Un graphe Git en colonnes, du récent vers l'ancien.
Par défaut : branches seules, commits intermédiaires repliés.
Les branches parallèles et leurs jonctions restent visibles côte à côte.

Options :
  -d, --detailed           Ajouter les hashes, messages de commits et tags
  -s, --simplified         Vue simplifiée (défaut)
  -n, --max-count <nombre> Limite de nœuds (défaut : 30, maximum : ${MAX_COUNT})
      --color <mode>       auto (défaut), always ou never
  -h, --help               Afficher cette aide

Exemples :
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
      `Le nombre de nœuds doit être un entier entre 1 et ${MAX_COUNT}.`,
    );
  }
  if (!["auto", "always", "never"].includes(values.color))
    throw new Error("--color attend auto, always ou never.");
  if (values.detailed && values.simplified)
    throw new Error("Choisir -d ou -s, une seule vue à la fois.");
  return { help: false, count, detailed: values.detailed, color: values.color };
}
