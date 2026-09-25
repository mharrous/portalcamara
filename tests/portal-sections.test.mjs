import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedApplicationUrl, normalizePortalSection } from "../auth.js";

test("admite las secciones internas configuradas", () => {
  assert.equal(normalizePortalSection("innovacion"), "innovacion");
  assert.equal(normalizePortalSection("soporte-informatico"), "soporte-informatico");
});

test("envía a la raíz cualquier sección desconocida", () => {
  assert.equal(normalizePortalSection("otra-seccion"), "root");
  assert.equal(normalizePortalSection(""), "root");
});

test("permite HTTPS y direcciones HTTP internas", () => {
  assert.equal(isAllowedApplicationUrl("https://servicio.example.com/"), true);
  assert.equal(isAllowedApplicationUrl("http://192.168.1.68:8080/"), true);
  assert.equal(isAllowedApplicationUrl("http://10.0.0.12/"), true);
  assert.equal(isAllowedApplicationUrl("http://servidor-interno:8080/"), true);
});

test("rechaza HTTP público y URLs con credenciales", () => {
  assert.equal(isAllowedApplicationUrl("http://example.com/"), false);
  assert.equal(isAllowedApplicationUrl("http://fcevil.com/"), false);
  assert.equal(isAllowedApplicationUrl("https://usuario:clave@example.com/"), false);
});
