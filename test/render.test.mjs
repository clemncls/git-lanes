import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import { renderGraph } from "../src/render.mjs";
import {
  sanitizeText,
  terminalWidth,
  visibleWidth,
  wrapLine,
  MAX_TEXT_LENGTH,
} from "../src/terminal.mjs";

function graph(nodes, overrides = {}) {
  return {
    repository: "demo",
    head: nodes[0]?.hash || "",
    current: "main",
    refs: nodes.flatMap((node) => node.refs),
    nodes,
    detailed: false,
    limited: false,
    limit: 30,
    ...overrides,
  };
}
const node = (hash, parents = [], name = "main") => ({
  hash,
  parents,
  subject: "message",
  refs: name ? [{ hash, type: "local", name }] : [],
});

test("rendering is deterministic and does not mutate the graph", () => {
  const data = graph([node("a", ["b"]), node("b", [], "base")]);
  const before = JSON.stringify(data);
  const plain = renderGraph(data, { columns: 80 });
  const colored = renderGraph(data, { columns: 80, color: true });
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.equal(JSON.stringify(data), before);
  assert.equal(renderGraph(data, { columns: 80 }), plain);
});

test("a reused lane does not recolor earlier nodes retroactively", () => {
  const data = graph([node("first"), node("second")], { head: "second" });
  const colored = renderGraph(data, { color: true });
  assert.match(colored, /\x1b\[38;5;117m●/);
  assert.match(colored, /\x1b\[1;38;5;114m◉/);
});

test("wide hostile layouts fail before allocating an unbounded canvas", () => {
  const nodes = Array.from({ length: 500 }, (_, index) =>
    node(`tip${index}`, [`missing${index}`]),
  );
  assert.throws(() => renderGraph(graph(nodes)), /rendering budget/);
});

test("terminal width is finite and bounded, even with an invalid COLUMNS value", () => {
  assert.equal(terminalWidth("Infinity"), 100);
  assert.equal(terminalWidth("not-a-number"), 100);
  assert.equal(terminalWidth("100000000000"), 240);
  assert.equal(terminalWidth("20"), 40);
});

test("wide Unicode and combining marks wrap by cells without splitting graphemes", () => {
  assert.equal(visibleWidth("é e\u0301 中 😀 👨‍👩‍👧‍👦"), 12);
  const text = "中".repeat(30) + "e\u0301".repeat(10) + "😀".repeat(10);
  const wrapped = wrapLine(text, 40);
  assert.ok(wrapped.split("\n").every((line) => visibleWidth(line) <= 40));
  assert.doesNotMatch(wrapped, /\n\u0301/);
});

test("terminal sanitization strips OSC controls and exposes bidi controls", () => {
  const text = sanitizeText("a\x1b]52;c;payload\x07b\u202ec\u2069");
  assert.equal(text, "ab\\u202ec\\u2069");
});

test("oversized metadata is shortened before terminal segmentation", () => {
  const safe = sanitizeText("a".repeat(MAX_TEXT_LENGTH * 20));
  assert.equal(safe.length, MAX_TEXT_LENGTH);
  assert.ok(safe.endsWith("…"));
  assert.equal(sanitizeText(safe), safe);
});
