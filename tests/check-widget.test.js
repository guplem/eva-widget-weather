// The contract check of scripts/check-widget.js. This widget writes no data, so the tests of the
// schema rules give a copy of the widget a folder input with a small schema.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { checkWidget } from "../scripts/check-widget.js";

const widget = fileURLToPath(new URL("..", import.meta.url));
const copies = [];

after(async () => {
  await Promise.all(copies.map((folder) => rm(folder, { recursive: true, force: true })));
});

/** A copy of the widget, with a folder input whose schema `change` alters. */
async function copyWith(change) {
  const folder = await mkdtemp(join(tmpdir(), "widget-"));
  copies.push(folder);
  for (const path of ["eva-widget.json", "config.json"]) await cp(join(widget, path), join(folder, path));
  const manifest = JSON.parse(await readFile(join(folder, "eva-widget.json"), "utf8"));
  manifest.inputs.push({
    id: "notes",
    type: "folder",
    label: "Notes",
    description: "A test folder.",
    why: "A test.",
    required: false,
    access: "write",
    schema: "schemas/notes.json",
    files: "*.json",
  });
  await writeFile(join(folder, "eva-widget.json"), JSON.stringify(manifest));
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { note: { type: "string" } },
  };
  change(schema);
  await mkdir(join(folder, "schemas"));
  await writeFile(join(folder, "schemas", "notes.json"), JSON.stringify(schema));
  await mkdir(join(folder, "data", "notes"), { recursive: true });
  await writeFile(join(folder, "data", "notes", "index.json"), "[]");
  return folder;
}

test("the widget follows the contract", async () => {
  assert.deepEqual(await checkWidget(widget), []);
});

test("a copy with a good schema follows the contract", async () => {
  assert.deepEqual(await checkWidget(await copyWith(() => {})), []);
});

test("an abbreviation fails, with its name", async () => {
  const folder = await copyWith((schema) => {
    schema.properties.loc = { type: "string" };
  });
  assert.deepEqual(await checkWidget(folder), [
    'schemas/notes.json: the field name "loc" breaks the naming rules (camelCase, full English words, no abbreviation).',
  ]);
});

test("a closed object fails", async () => {
  const folder = await copyWith((schema) => {
    schema.additionalProperties = false;
  });
  assert.match((await checkWidget(folder))[0], /closes the object/);
});
