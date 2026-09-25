import assert from "node:assert/strict";
import test from "node:test";

import { normalizePortalSection } from "../auth.js";

test("admite las secciones internas configuradas", () => {
  assert.equal(normalizePortalSection("innovacion"), "innovacion");
  assert.equal(normalizePortalSection("soporte-informatico"), "soporte-informatico");
});

test("envía a la raíz cualquier sección desconocida", () => {
  assert.equal(normalizePortalSection("otra-seccion"), "root");
  assert.equal(normalizePortalSection(""), "root");
});
