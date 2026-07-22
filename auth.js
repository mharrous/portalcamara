const SESSION_COOKIE = "portal_session";
const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const MICROSOFT_START_PATH = "/api/auth/microsoft/start";
const MICROSOFT_CALLBACK_PATH = "/api/auth/microsoft/callback";
const ADMIN_PATH = "/admin/users";

export function authConfigurationError(env) {
  if (!env?.AUTH_DB) return "Falta enlazar la base de datos AUTH_DB.";
  if (entraEnabled(env) && (!env.ENTRA_TENANT_ID || !env.ENTRA_CLIENT_ID || !env.ENTRA_CLIENT_SECRET || !env.ENTRA_REDIRECT_URI)) {
    return "Falta completar la configuración de Microsoft Entra.";
  }
  return "";
}

export function loginOptions(env) {
  const microsoftEnabled = entraEnabled(env);
  return {
    microsoftEnabled,
    microsoftStartPath: MICROSOFT_START_PATH,
  };
}

export async function handleAuthRoute(request, env, renderers) {
  const url = new URL(request.url);
  if (["POST", "DELETE"].includes(request.method) && url.pathname.startsWith("/api/admin/") && !sameOrigin(request)) {
    return json({ error: "Origen no permitido" }, 403);
  }

  const applicationLaunchMatch = url.pathname.match(/^\/api\/apps\/([a-z0-9-]+)\/launch$/);
  if (applicationLaunchMatch && request.method === "GET") {
    return launchApplication(request, env, applicationLaunchMatch[1]);
  }

  if (url.pathname === "/api/sso/calendario/exchange" && request.method === "POST") {
    return exchangeCalendarCode(request, env);
  }
  if (url.pathname === "/api/sso/calendario/introspect" && request.method === "POST") {
    return introspectCalendarAccess(request, env);
  }

  if (url.pathname === MICROSOFT_START_PATH && request.method === "GET") {
    return beginMicrosoftLogin(request, env);
  }
  if (url.pathname === MICROSOFT_CALLBACK_PATH && (request.method === "GET" || request.method === "POST")) {
    return finishMicrosoftLogin(request, env, renderers);
  }
  if (url.pathname === "/api/auth/front-channel-logout" && (request.method === "GET" || request.method === "POST")) {
    return logoutResponse(request, env, "/login");
  }
  if (url.pathname === ADMIN_PATH && request.method === "GET") {
    const user = await getSessionUser(request, env);
    if (!user) return redirect(`/login?next=${encodeURIComponent(ADMIN_PATH)}`);
    if (user.role !== "admin") return renderers.html(renderers.forbidden(), { status: 403 });
    return renderers.html(renderSecurityAdminPage(user));
  }
  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    return withAdmin(request, env, async () => json(await listAdministrationData(env)));
  }
  if (url.pathname === "/api/admin/users" && request.method === "POST") {
    return withAdmin(request, env, (admin) => saveUser(request, env, admin));
  }
  if (url.pathname === "/api/admin/applications" && request.method === "POST") {
    return withAdmin(request, env, (admin) => saveApplication(request, env, admin));
  }
  if (url.pathname === "/api/admin/permissions" && request.method === "POST") {
    return withAdmin(request, env, (admin) => savePermission(request, env, admin));
  }
  if (url.pathname === "/api/admin/activity" && request.method === "GET") {
    return withAdmin(request, env, async () => json({ events: await listActivity(env) }));
  }
  if (url.pathname === "/api/admin/sessions" && request.method === "GET") {
    return withAdmin(request, env, async (admin) => json({ sessions: await listSessions(env, admin.sessionId) }));
  }
  if (url.pathname === "/api/admin/sessions" && request.method === "DELETE") {
    return withAdmin(request, env, (admin) => revokeOtherSessions(env, admin));
  }
  const sessionMatch = url.pathname.match(/^\/api\/admin\/sessions\/(\d+)$/);
  if (sessionMatch && request.method === "DELETE") {
    return withAdmin(request, env, (admin) => revokeSession(Number(sessionMatch[1]), env, admin));
  }
  const userSessionsMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/sessions$/);
  if (userSessionsMatch && request.method === "DELETE") {
    return withAdmin(request, env, (admin) => revokeUserSessions(Number(userSessionsMatch[1]), env, admin));
  }
  const deleteUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (deleteUserMatch && request.method === "DELETE") {
    return withAdmin(request, env, (admin) => deleteUser(Number(deleteUserMatch[1]), env, admin));
  }
  return null;
}

async function launchApplication(request, env, applicationCode) {
  const user = await getSessionUser(request, env);
  if (!user) return redirect(`/login?next=${encodeURIComponent(new URL(request.url).pathname)}`);
  const application = await env.AUTH_DB.prepare(`
    SELECT a.code, a.url, a.integration_status
    FROM applications a
    LEFT JOIN user_application_permissions p
      ON p.application_code = a.code AND p.user_id = ?
    WHERE a.code = ? AND a.active = 1
      AND p.active = 1
  `).bind(user.id, applicationCode).first();
  if (!application) {
    await audit(env, user.id, "application.denied", "application", applicationCode, {});
    return new Response("Acceso denegado", { status: 403 });
  }

  const destination = new URL(application.url);
  if (destination.protocol !== "https:") return new Response("Destino no válido", { status: 500 });
  if (application.integration_status === "direct") {
    await audit(env, user.id, "application.launch", "application", application.code, { mode: "direct" });
    return redirect(destination.toString(), { "cache-control": "no-store", "referrer-policy": "no-referrer" });
  }
  const code = randomToken(32);
  const expiresAt = new Date(Date.now() + 45 * 1000).toISOString();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM login_codes WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.AUTH_DB.prepare("INSERT INTO login_codes (code_hash, user_id, application_code, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256Text(code), user.id, application.code, expiresAt),
  ]);
  await audit(env, user.id, "application.launch", "application", application.code, {});
  destination.pathname = "/api/auth/portal";
  destination.search = new URLSearchParams({ code }).toString();
  destination.hash = "";
  return redirect(destination.toString(), { "cache-control": "no-store", "referrer-policy": "no-referrer" });
}

async function exchangeCalendarCode(request, env) {
  const authenticationError = await requireCalendarService(request, env);
  if (authenticationError) return authenticationError;
  const payload = await request.json().catch(() => null);
  const code = String(payload?.code || "").trim();
  if (!code) return json({ error: "Código de acceso no válido" }, 400);

  const loginCode = await env.AUTH_DB.prepare(`
    DELETE FROM login_codes
    WHERE code_hash = ? AND application_code = 'calendario-eventos' AND expires_at > CURRENT_TIMESTAMP
    RETURNING user_id
  `).bind(await sha256Text(code)).first();
  if (!loginCode) return json({ error: "El acceso ha caducado o ya fue utilizado" }, 403);

  const user = await calendarAuthorizedUser(env, Number(loginCode.user_id));
  if (!user) return json({ error: "Acceso no autorizado" }, 403);
  return json({ user: publicCalendarUser(user) });
}

async function introspectCalendarAccess(request, env) {
  const authenticationError = await requireCalendarService(request, env);
  if (authenticationError) return authenticationError;
  const payload = await request.json().catch(() => null);
  const userId = Number(payload?.userId || 0);
  if (!userId) return json({ error: "Usuario no válido" }, 400);
  const user = await calendarAuthorizedUser(env, userId);
  if (!user) return json({ active: false }, 403);
  return json({ active: true, user: publicCalendarUser(user) });
}

async function calendarAuthorizedUser(env, userId) {
  return env.AUTH_DB.prepare(`
    SELECT u.id, u.display_name, u.email, u.role, p.role AS application_role
    FROM users u
    JOIN user_application_permissions p
      ON p.user_id = u.id AND p.application_code = 'calendario-eventos'
    WHERE u.id = ? AND u.active = 1 AND p.active = 1
  `).bind(userId).first();
}

function publicCalendarUser(user) {
  return {
    id: Number(user.id),
    displayName: user.display_name || user.email,
    email: user.email || "",
    role: user.application_role || "user",
  };
}

async function requireCalendarService(request, env) {
  const configuredSecret = String(env.CALENDARIO_SSO_SECRET || "");
  if (!configuredSecret) return json({ error: "Integración del calendario no configurada" }, 503);
  const authorization = String(request.headers.get("authorization") || "");
  const providedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!(await secureTextEqual(providedSecret, configuredSecret))) return json({ error: "Servicio no autorizado" }, 401);
  return null;
}

export async function logoutResponse(request, env, destination = "/login") {
  const token = readCookie(request, SESSION_COOKIE);
  const user = token ? await getSessionUser(request, env) : null;
  if (token) await env.AUTH_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Text(token)).run();
  if (user) await audit(env, user.id, "session.logout", "session", String(user.sessionId || ""), {});
  return redirect(destination, { "set-cookie": clearSessionCookie() });
}

export async function getSessionUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Text(token);
  const row = await env.AUTH_DB.prepare(`
    SELECT u.id, u.legacy_username, u.display_name, u.email, u.role, u.active,
           u.entra_tenant_id, u.entra_oid, s.id AS session_id, s.provider, s.expires_at, s.user_agent
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first();

  if (row) {
    if (!Number(row.active) || row.provider !== "microsoft") {
      await env.AUTH_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
      return null;
    }
    await env.AUTH_DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?").bind(tokenHash).run();
    return normalizeUser(row);
  }

  return null;
}

export async function allowedApplicationCodes(user, env) {
  const result = await env.AUTH_DB.prepare(`
    SELECT p.application_code AS code
    FROM user_application_permissions p
    JOIN applications a ON a.code = p.application_code
    WHERE p.user_id = ? AND p.active = 1 AND a.active = 1
  `).bind(user.id).all();
  return new Set((result.results || []).map((row) => row.code));
}

export async function portalApplications(user, env) {
  const query = user.role === "admin"
    ? `SELECT code, name, category, label, portal_section, sort_order, url
       FROM applications WHERE active = 1
       ORDER BY portal_section, sort_order, name`
    : `SELECT a.code, a.name, a.category, a.label, a.portal_section, a.sort_order, a.url
       FROM applications a
       JOIN user_application_permissions p ON p.application_code = a.code
       WHERE p.user_id = ? AND p.active = 1 AND a.active = 1
       ORDER BY a.portal_section, a.sort_order, a.name`;
  const statement = env.AUTH_DB.prepare(query);
  const result = user.role === "admin" ? await statement.all() : await statement.bind(user.id).all();
  return result.results || [];
}

async function beginMicrosoftLogin(request, env) {
  if (!entraEnabled(env)) return new Response("Microsoft Entra todavía no está activado.", { status: 503 });
  const url = new URL(request.url);
  const state = randomToken(32);
  const nonce = randomToken(32);
  const verifier = randomToken(48);
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000).toISOString();
  await env.AUTH_DB.prepare("DELETE FROM oauth_states WHERE expires_at <= CURRENT_TIMESTAMP").run();
  await env.AUTH_DB.prepare(`
    INSERT INTO oauth_states (state_hash, code_verifier, nonce, return_to, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(await sha256Text(state), verifier, nonce, sanitizeNextPath(url.searchParams.get("next") || "/"), expiresAt).run();

  const authorize = new URL(`https://login.microsoftonline.com/${encodeURIComponent(env.ENTRA_TENANT_ID)}/oauth2/v2.0/authorize`);
  authorize.searchParams.set("client_id", env.ENTRA_CLIENT_ID);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", env.ENTRA_REDIRECT_URI);
  authorize.searchParams.set("response_mode", "form_post");
  authorize.searchParams.set("scope", "openid profile email");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return redirect(authorize.toString());
}

async function finishMicrosoftLogin(request, env, renderers) {
  if (!entraEnabled(env)) return renderers.html(renderers.forbidden("Microsoft Entra todavía no está activado."), { status: 503 });
  const params = request.method === "POST" ? await request.formData() : new URL(request.url).searchParams;
  const state = String(params.get("state") || "");
  const code = String(params.get("code") || "");
  const oauthError = String(params.get("error_description") || params.get("error") || "");
  if (oauthError) {
    await audit(env, null, "login.denied", "authentication", "microsoft", { reason: "microsoft_error" });
    return renderers.html(renderers.forbidden("Microsoft no pudo completar el acceso."), { status: 401 });
  }
  if (!state || !code) {
    await audit(env, null, "login.denied", "authentication", "microsoft", { reason: "invalid_response" });
    return renderers.html(renderers.forbidden("La respuesta de Microsoft no es válida."), { status: 400 });
  }

  const stateHash = await sha256Text(state);
  const saved = await env.AUTH_DB.prepare(`
    DELETE FROM oauth_states
    WHERE state_hash = ? AND expires_at > CURRENT_TIMESTAMP
    RETURNING code_verifier, nonce, return_to
  `).bind(stateHash).first();
  if (!saved) {
    await audit(env, null, "login.denied", "authentication", "microsoft", { reason: "expired_state" });
    return renderers.html(renderers.forbidden("El intento de acceso ha caducado o ya fue utilizado."), { status: 400 });
  }

  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.ENTRA_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.ENTRA_CLIENT_ID,
      client_secret: env.ENTRA_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.ENTRA_REDIRECT_URI,
      code_verifier: saved.code_verifier,
      scope: "openid profile email",
    }),
  });
  if (!tokenResponse.ok) {
    await audit(env, null, "login.denied", "authentication", "microsoft", { reason: "token_exchange" });
    return renderers.html(renderers.forbidden("Microsoft rechazó el intercambio de autorización."), { status: 401 });
  }
  const tokens = await tokenResponse.json();
  const claims = await validateIdToken(tokens.id_token, env, saved.nonce);
  const user = await findAndLinkMicrosoftUser(claims, env);
  const claimedEmail = String(claims.preferred_username || claims.email || "").trim().toLowerCase();
  if (!user) {
    await audit(env, null, "login.denied", "authentication", "microsoft", { reason: "user_not_authorized", email: claimedEmail });
    return renderers.html(renderers.forbidden("Tu cuenta no ha sido autorizada por un administrador."), { status: 403 });
  }
  if (!user.active) {
    await audit(env, user.id, "login.denied", "user", String(user.id), { reason: "user_inactive" });
    return renderers.html(renderers.forbidden("Tu usuario está desactivado."), { status: 403 });
  }
  const cookie = await createDatabaseSession(user.id, "microsoft", request, env);
  await audit(env, user.id, "login.success", "user", String(user.id), { provider: "microsoft" });
  return redirect(sanitizeNextPath(saved.return_to), { "set-cookie": cookie });
}

async function validateIdToken(token, env, expectedNonce) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid ID token");
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported ID token");

  const metadataResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.ENTRA_TENANT_ID)}/v2.0/.well-known/openid-configuration`);
  if (!metadataResponse.ok) throw new Error("OIDC metadata unavailable");
  const metadata = await metadataResponse.json();
  const jwksResponse = await fetch(metadata.jwks_uri);
  if (!jwksResponse.ok) throw new Error("JWKS unavailable");
  const jwks = await jwksResponse.json();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Signing key unavailable");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!validSignature) throw new Error("Invalid signature");

  const now = Math.floor(Date.now() / 1000);
  const audienceValid = claims.aud === env.ENTRA_CLIENT_ID || (Array.isArray(claims.aud) && claims.aud.includes(env.ENTRA_CLIENT_ID));
  if (!audienceValid || claims.iss !== metadata.issuer || claims.tid !== env.ENTRA_TENANT_ID) throw new Error("Invalid token authority");
  if (!claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now + 60)) throw new Error("Expired token");
  if (!claims.oid || claims.nonce !== expectedNonce) throw new Error("Invalid token identity");
  return claims;
}

async function findAndLinkMicrosoftUser(claims, env) {
  let row = await env.AUTH_DB.prepare(`
    SELECT * FROM users WHERE entra_tenant_id = ? AND entra_oid = ?
  `).bind(claims.tid, claims.oid).first();
  const email = String(claims.preferred_username || claims.email || "").trim().toLowerCase();
  if (!row && email) {
    row = await env.AUTH_DB.prepare("SELECT * FROM users WHERE lower(email) = ?").bind(email).first();
    if (row && (!row.entra_oid || (row.entra_oid === claims.oid && row.entra_tenant_id === claims.tid))) {
      await env.AUTH_DB.prepare(`
        UPDATE users SET entra_tenant_id = ?, entra_oid = ?, auth_provider = CASE WHEN legacy_username IS NULL THEN 'microsoft' ELSE 'both' END,
          display_name = COALESCE(NULLIF(?, ''), display_name), last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(claims.tid, claims.oid, claims.name || "", row.id).run();
      row = await env.AUTH_DB.prepare("SELECT * FROM users WHERE id = ?").bind(row.id).first();
    } else {
      row = null;
    }
  } else if (row) {
    await env.AUTH_DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  }
  return row ? normalizeUser(row) : null;
}

async function createDatabaseSession(userId, provider, request, env) {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.AUTH_DB.prepare("INSERT INTO sessions (token_hash, user_id, provider, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256Text(token), userId, provider, expiresAt, String(request.headers.get("user-agent") || "").slice(0, 500)),
  ]);
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function withAdmin(request, env, operation) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "No autenticado" }, 401);
  if (user.role !== "admin") return json({ error: "Acceso denegado" }, 403);
  try {
    return await operation(user);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 400);
  }
}

async function listAdministrationData(env) {
  const [users, applications, permissions] = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("SELECT id, legacy_username, display_name, email, role, active, entra_tenant_id, entra_oid, auth_provider, last_login_at FROM users ORDER BY display_name"),
    env.AUTH_DB.prepare("SELECT code, name, category, label, portal_section, sort_order, url, active, controlled, integration_status FROM applications ORDER BY portal_section, sort_order, name"),
    env.AUTH_DB.prepare("SELECT user_id, application_code, role, active FROM user_application_permissions"),
  ]);
  return { users: users.results || [], applications: applications.results || [], permissions: permissions.results || [] };
}

async function listSessions(env, currentSessionId) {
  await env.AUTH_DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
  const result = await env.AUTH_DB.prepare(`
    SELECT s.id, s.user_id, s.provider, s.created_at, s.last_seen_at, s.expires_at, s.user_agent,
           u.display_name, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.expires_at > CURRENT_TIMESTAMP
    ORDER BY s.last_seen_at DESC
  `).all();
  return (result.results || []).map((session) => ({
    ...session,
    current: Number(session.id) === Number(currentSessionId),
  }));
}

async function listActivity(env) {
  const result = await env.AUTH_DB.prepare(`
    SELECT a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
           u.display_name AS actor_name, u.email AS actor_email
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY a.id DESC
    LIMIT 200
  `).all();
  return result.results || [];
}

async function revokeSession(sessionId, env, admin) {
  if (!sessionId) throw new Error("Sesión no válida.");
  if (sessionId === Number(admin.sessionId)) throw new Error("Usa Salir para cerrar tu sesión actual.");
  const target = await env.AUTH_DB.prepare(`
    SELECT s.id, s.user_id, u.display_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).bind(sessionId).first();
  if (!target) throw new Error("La sesión ya no existe.");
  await env.AUTH_DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  await audit(env, admin.id, "session.revoke", "session", String(sessionId), { userId: Number(target.user_id), displayName: target.display_name });
  return json({ ok: true });
}

async function revokeUserSessions(userId, env, admin) {
  if (!userId) throw new Error("Usuario no válido.");
  const target = await env.AUTH_DB.prepare("SELECT id, display_name FROM users WHERE id = ?").bind(userId).first();
  if (!target) throw new Error("Usuario no encontrado.");
  const result = userId === admin.id
    ? await env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(userId, admin.sessionId).run()
    : await env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  await audit(env, admin.id, "session.revoke_user", "user", String(userId), { displayName: target.display_name, count: Number(result.meta?.changes || 0) });
  return json({ ok: true, count: Number(result.meta?.changes || 0) });
}

async function revokeOtherSessions(env, admin) {
  const result = await env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(admin.id, admin.sessionId).run();
  await audit(env, admin.id, "session.revoke_others", "user", String(admin.id), { count: Number(result.meta?.changes || 0) });
  return json({ ok: true, count: Number(result.meta?.changes || 0) });
}

async function saveUser(request, env, admin) {
  const payload = await request.json();
  const id = Number(payload.id || 0);
  const displayName = String(payload.displayName || "").trim();
  const email = String(payload.email || "").trim().toLowerCase() || null;
  const legacyUsername = String(payload.legacyUsername || "").trim() || null;
  const role = payload.role === "admin" ? "admin" : "user";
  const active = payload.active === false ? 0 : 1;
  if (!displayName) throw new Error("El nombre es obligatorio.");

  let result;
  if (id) {
    result = await env.AUTH_DB.prepare(`
      UPDATE users SET display_name = ?, email = ?, legacy_username = ?, role = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? RETURNING id
    `).bind(displayName, email, legacyUsername, role, active, id).first();
    if (!result) throw new Error("Usuario no encontrado.");
    if (!active) await env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  } else {
    result = await env.AUTH_DB.prepare(`
      INSERT INTO users (legacy_username, display_name, email, role, active, auth_provider)
      VALUES (?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN 'microsoft' ELSE 'local' END)
      RETURNING id
    `).bind(legacyUsername, displayName, email, role, active, legacyUsername).first();
  }
  await audit(env, admin.id, id ? "user.update" : "user.create", "user", String(result.id), { email, role, active: Boolean(active) });
  return json({ ok: true, id: result.id });
}

function applicationSlug(value) {
  return String(value || "aplicacion")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "aplicacion";
}

async function saveApplication(request, env, admin) {
  const payload = await request.json();
  const existingCode = String(payload.code || "").trim();
  const name = String(payload.name || "").trim().slice(0, 100);
  const label = String(payload.label || "").trim().slice(0, 40);
  const portalSection = payload.portalSection === "innovacion" ? "innovacion" : "root";
  let destination;
  try {
    destination = new URL(String(payload.url || "").trim());
  } catch {
    throw new Error("La ruta debe ser una URL completa válida.");
  }
  if (!name || !label) throw new Error("El nombre y la etiqueta son obligatorios.");
  if (destination.protocol !== "https:") throw new Error("La ruta debe comenzar por https://");

  if (existingCode) {
    if (!/^[a-z0-9-]+$/.test(existingCode)) throw new Error("Código de tarjeta no válido.");
    const result = await env.AUTH_DB.prepare(`
      UPDATE applications
      SET name = ?, category = ?, label = ?, portal_section = ?, url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE code = ?
      RETURNING code
    `).bind(name, label, label, portalSection, destination.toString(), existingCode).first();
    if (!result) throw new Error("Tarjeta no encontrada.");
    await audit(env, admin.id, "application.update", "application", existingCode, { name, label, portalSection, url: destination.toString() });
    return json({ ok: true, code: existingCode });
  }

  let code = applicationSlug(name);
  const duplicate = await env.AUTH_DB.prepare("SELECT code FROM applications WHERE code = ?").bind(code).first();
  if (duplicate) code = `${code.slice(0, 40)}-${crypto.randomUUID().slice(0, 6)}`;
  const order = await env.AUTH_DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM applications WHERE portal_section = ?")
    .bind(portalSection)
    .first();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`
      INSERT INTO applications (code, name, category, label, portal_section, sort_order, url, active, controlled, integration_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 'direct')
    `).bind(code, name, label, label, portalSection, Number(order?.next_order || 10), destination.toString()),
    env.AUTH_DB.prepare(`
      INSERT INTO user_application_permissions (user_id, application_code, role, active)
      VALUES (?, ?, 'admin', 1)
    `).bind(admin.id, code),
  ]);
  await audit(env, admin.id, "application.create", "application", code, { name, label, portalSection, url: destination.toString() });
  return json({ ok: true, code }, 201);
}

async function savePermission(request, env, admin) {
  const payload = await request.json();
  const userId = Number(payload.userId || 0);
  const applicationCode = String(payload.applicationCode || "");
  const role = String(payload.role || "user").trim() || "user";
  const active = payload.active === false ? 0 : 1;
  if (!userId || !applicationCode) throw new Error("Usuario y aplicación son obligatorios.");
  await env.AUTH_DB.prepare(`
    INSERT INTO user_application_permissions (user_id, application_code, role, active)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, application_code) DO UPDATE SET role = excluded.role, active = excluded.active, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, applicationCode, role, active).run();
  await audit(env, admin.id, "permission.update", "application", applicationCode, { userId, role, active: Boolean(active) });
  return json({ ok: true });
}

async function deleteUser(userId, env, admin) {
  if (!userId) throw new Error("Usuario no válido.");
  if (userId === admin.id) throw new Error("No puedes borrar tu propio usuario.");
  const target = await env.AUTH_DB.prepare("SELECT id, display_name, role, active FROM users WHERE id = ?").bind(userId).first();
  if (!target) throw new Error("Usuario no encontrado.");
  if (target.role === "admin" && Number(target.active)) {
    const count = await env.AUTH_DB.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND active = 1").first();
    if (Number(count?.total || 0) <= 1) throw new Error("Debe permanecer al menos un administrador activo.");
  }
  await audit(env, admin.id, "user.delete", "user", String(userId), { displayName: target.display_name });
  await env.AUTH_DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  return json({ ok: true });
}

async function audit(env, actorUserId, action, targetType, targetId, detail) {
  await env.AUTH_DB.prepare(`
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)
  `).bind(actorUserId, action, targetType, targetId, JSON.stringify(detail || {})).run();
}

function renderSecurityAdminPage(user) {
  const safeName = escapeHtml(user.displayName || user.username || "Administrador");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Administración del portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
  <style>
    :root{font-family:Inter,system-ui,sans-serif;color:#fffaf7;background:#283b58}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(128deg,#263955 0%,#3e506c 31%,#604c50 53%,#9f4328 76%,#ef9b6b 118%);background-attachment:fixed;color:#fffaf7}body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 22%,rgba(255,255,255,.09),transparent 34%),linear-gradient(180deg,rgba(11,24,43,.18),transparent 45%)}.wrap{position:relative;z-index:1;width:min(1240px,calc(100% - 40px));margin:0 auto;padding:34px 0 60px}.top{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:20px;padding:18px 20px;border:1px solid rgba(255,255,255,.27);border-radius:22px;background:linear-gradient(145deg,rgba(153,179,209,.19),rgba(201,99,59,.14));box-shadow:0 22px 60px rgba(35,22,30,.18);backdrop-filter:blur(23px) saturate(112%);-webkit-backdrop-filter:blur(23px) saturate(112%)}.top h1{margin:5px 0 0;color:#fff;font:700 clamp(27px,3vw,36px)/1.05 "Space Grotesk",sans-serif;letter-spacing:-.02em}.top .muted{margin:0;color:rgba(255,247,242,.7);font-family:"JetBrains Mono",monospace;letter-spacing:.04em}.muted{color:rgba(255,247,242,.68);font-size:13px}.button,button{border:1px solid rgba(255,255,255,.34);border-radius:12px;padding:11px 16px;background:linear-gradient(145deg,rgba(237,36,64,.88),rgba(198,86,48,.88));box-shadow:0 10px 24px rgba(47,24,30,.14);color:#fff;font:700 13px Inter,sans-serif;text-decoration:none;cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.button:hover,button:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.6);box-shadow:0 14px 28px rgba(47,24,30,.2)}.secondary{background:rgba(255,250,247,.92);color:#1b2b43;border-color:rgba(255,255,255,.62)}.danger{background:rgba(255,244,241,.91);color:#a61d2f;border-color:rgba(255,211,204,.72)}.compact{padding:8px 11px;font-size:12px}.tabs{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px;padding:10px;border:1px solid rgba(255,255,255,.24);border-radius:18px;background:rgba(255,255,255,.09);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.tabs button{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.22)}.tabs button.active{background:linear-gradient(145deg,rgba(238,37,64,.91),rgba(202,89,49,.91));color:#fff;border-color:rgba(255,255,255,.42)}.panel{background:linear-gradient(145deg,rgba(154,180,210,.18),rgba(201,100,60,.14));border:1px solid rgba(255,255,255,.28);border-radius:22px;padding:22px;box-shadow:0 22px 58px rgba(35,22,30,.16);backdrop-filter:blur(23px) saturate(112%);-webkit-backdrop-filter:blur(23px) saturate(112%)}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px}.panel h2{margin:0 0 5px;color:#fff;font:700 24px "Space Grotesk",sans-serif}.notice{margin:0 0 14px;padding:12px 14px;border:1px solid rgba(255,255,255,.3);border-radius:12px;background:rgba(255,227,168,.9);color:#5f3e00;font-weight:700}.table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.18);border-radius:15px}table{width:100%;border-collapse:collapse;background:rgba(24,38,59,.13)}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid rgba(255,255,255,.16);vertical-align:top}th{font:600 10px "JetBrains Mono",monospace;text-transform:uppercase;letter-spacing:.09em;color:rgba(255,247,242,.72);background:rgba(26,40,60,.28)}td{color:#fffaf7}tbody tr:hover{background:rgba(255,255,255,.045)}input,select{width:100%;padding:10px 11px;border:1px solid rgba(255,255,255,.55);border-radius:10px;background:rgba(255,250,247,.93);color:#192941;font:500 13px Inter,sans-serif;outline:none}input:focus,select:focus{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.14)}input[type=checkbox]{width:17px;height:17px;padding:0;accent-color:#d94b36}.apps{display:grid;gap:10px;min-width:230px}.perm{display:grid;grid-template-columns:22px 1fr;align-items:center;gap:7px}.actions{display:grid;gap:7px;min-width:128px}.tag{display:inline-flex;padding:5px 8px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.14);color:#fff7ef;font-size:11px;font-weight:800}.tag.current{background:rgba(196,244,214,.88);color:#166534}.device{font-weight:800}.event{font-weight:800;color:#ffd5d3}.detail{max-width:370px;white-space:normal;color:rgba(255,247,242,.78)}.backup-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.backup-card{border:1px solid rgba(255,255,255,.24);border-radius:16px;padding:18px;background:linear-gradient(145deg,rgba(255,255,255,.13),rgba(214,119,78,.1))}.backup-card h3{margin:0 0 7px;color:#fff}.backup-card p{margin:0;line-height:1.55;color:rgba(255,247,242,.75)}.backup-card code{font-size:12px;color:#fff}.hidden{display:none!important}@media(max-width:850px){.top,.panel-head{align-items:stretch;flex-direction:column}.top .button,.panel-head button{width:100%;text-align:center}.backup-grid{grid-template-columns:1fr}table{min-width:900px}.wrap{width:min(100% - 20px,1240px);padding-top:16px}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top"><div><p class="muted">Sesión: ${safeName}</p><h1>Administración del portal</h1></div><a class="button secondary" href="/">Volver al portal</a></div>
    <div id="notice" class="notice" hidden></div>
    <nav class="tabs" aria-label="Secciones de administración">
      <button class="active" data-tab="users">Usuarios y permisos</button>
      <button data-tab="sessions">Sesiones activas</button>
      <button data-tab="activity">Actividad</button>
      <button data-tab="backups">Copias de seguridad</button>
    </nav>

    <section class="panel" data-section="users">
      <div class="panel-head"><div><h2>Usuarios y permisos</h2><p class="muted">Identidades Microsoft, aplicaciones autorizadas y cierre de sesiones.</p></div><button id="newUser">Añadir usuario</button></div>
      <div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Email Microsoft</th><th>Acceso</th><th>Estado</th><th>Aplicaciones</th><th>Acciones</th></tr></thead><tbody id="users"></tbody></table></div>
    </section>

    <section class="panel hidden" data-section="sessions">
      <div class="panel-head"><div><h2>Sesiones activas</h2><p class="muted">Dispositivos conectados, última actividad y fecha de caducidad.</p></div><button class="secondary" id="closeOtherSessions">Cerrar mis otras sesiones</button></div>
      <div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Dispositivo</th><th>Inicio</th><th>Última actividad</th><th>Caduca</th><th>Acción</th></tr></thead><tbody id="sessions"></tbody></table></div>
    </section>

    <section class="panel hidden" data-section="activity">
      <div class="panel-head"><div><h2>Actividad reciente</h2><p class="muted">Últimos 200 eventos de seguridad y administración. No se almacenan direcciones IP.</p></div><button class="secondary" id="refreshActivity">Actualizar</button></div>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Responsable</th><th>Acción</th><th>Objetivo</th><th>Detalle</th></tr></thead><tbody id="activity"></tbody></table></div>
    </section>

    <section class="panel hidden" data-section="backups">
      <div class="panel-head"><div><h2>Copias y recuperación</h2><p class="muted">Protección de la base central antes de cambios y migraciones.</p></div></div>
      <div class="backup-grid">
        <article class="backup-card"><h3>Time Travel</h3><p>D1 mantiene recuperación automática por punto temporal. Consulta el estado antes de cualquier migración con <code>wrangler d1 time-travel info</code>.</p></article>
        <article class="backup-card"><h3>Exportación cifrada</h3><p>El repositorio incluye una tarea mensual preparada. Requiere configurar los secretos de GitHub indicados en <code>BACKUP_RECOVERY.md</code>.</p></article>
        <article class="backup-card"><h3>Restauración</h3><p>La restauración sobrescribe producción. Debe seguirse el procedimiento documentado y realizar una comprobación trimestral.</p></article>
      </div>
    </section>
  </main>
  <script>
    let data={users:[],applications:[],permissions:[]};let sessions=[];let events=[];
    const notice=document.querySelector('#notice');
    function esc(value){return String(value??'').replace(/[&<>"']/g,function(character){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];});}
    function show(message){notice.textContent=message;notice.hidden=false;window.scrollTo({top:0,behavior:'smooth'});}
    function date(value){if(!value)return '—';const normalized=String(value).includes('T')?value:String(value).replace(' ','T')+'Z';return new Date(normalized).toLocaleString('es-ES');}
    function permission(userId,code){return data.permissions.find(function(item){return Number(item.user_id)===Number(userId)&&item.application_code===code;});}
    function device(userAgent){const ua=String(userAgent||'');let browser='Navegador';let system='Dispositivo';if(/Edg\\//.test(ua))browser='Edge';else if(/Chrome\\//.test(ua))browser='Chrome';else if(/Firefox\\//.test(ua))browser='Firefox';else if(/Safari\\//.test(ua))browser='Safari';if(/Windows/.test(ua))system='Windows';else if(/Android/.test(ua))system='Android';else if(/iPhone|iPad/.test(ua))system='iPhone/iPad';else if(/Macintosh/.test(ua))system='Mac';return browser+' · '+system;}
    function actionLabel(action){return ({'login.success':'Inicio correcto','login.denied':'Acceso rechazado','session.logout':'Cierre de sesión','session.revoke':'Sesión cerrada por admin','session.revoke_user':'Sesiones de usuario cerradas','session.revoke_others':'Otras sesiones cerradas','application.launch':'Aplicación abierta','application.denied':'Aplicación rechazada','application.create':'Tarjeta creada','application.update':'Tarjeta actualizada','permission.update':'Permiso actualizado','user.update':'Usuario actualizado','user.create':'Usuario creado','user.delete':'Usuario eliminado'})[action]||action;}
    function detailText(event){let detail={};try{detail=JSON.parse(event.detail||'{}');}catch(_){}const parts=[];if(detail.reason)parts.push('Motivo: '+detail.reason);if(detail.email)parts.push(detail.email);if(detail.displayName)parts.push(detail.displayName);if(detail.userId)parts.push('Usuario #'+detail.userId);if(detail.count!==undefined)parts.push(detail.count+' sesiones');if(detail.active!==undefined)parts.push(detail.active?'Activado':'Desactivado');return parts.join(' · ')||'—';}
    function drawUsers(){const body=document.querySelector('#users');body.innerHTML='';data.users.forEach(function(user){const row=document.createElement('tr');row.innerHTML='<td><input data-field="displayName" value="'+esc(user.display_name)+'"><span class="muted">'+(user.entra_oid?'Microsoft vinculado':'Pendiente de primer acceso Microsoft')+'</span></td><td><input data-field="email" type="email" placeholder="nombre@empresa.es" value="'+esc(user.email||'')+'"></td><td><select data-field="role"><option value="user">Usuario</option><option value="admin">Administrador</option></select></td><td><select data-field="active"><option value="1">Activo</option><option value="0">Desactivado</option></select></td><td><div class="apps">'+data.applications.map(function(app){const current=permission(user.id,app.code);return '<label class="perm"><input type="checkbox" data-app="'+esc(app.code)+'" '+(current&&Number(current.active)?'checked':'')+'><span>'+esc(app.name)+'</span></label>';}).join('')+'</div></td><td><div class="actions"><button data-save>Guardar</button><button class="secondary compact" data-sessions>Cerrar sesiones</button><button class="danger compact" data-delete>Borrar</button></div></td>';row.querySelector('[data-field="role"]').value=user.role;row.querySelector('[data-field="active"]').value=String(Number(user.active));row.querySelector('[data-save]').onclick=function(){saveUser(row,user);};row.querySelector('[data-sessions]').onclick=function(){closeUserSessions(user);};row.querySelector('[data-delete]').onclick=function(){removeUser(user);};body.appendChild(row);});}
    function drawSessions(){const body=document.querySelector('#sessions');body.innerHTML='';if(!sessions.length){body.innerHTML='<tr><td colspan="6" class="muted">No hay sesiones activas.</td></tr>';return;}sessions.forEach(function(session){const row=document.createElement('tr');row.innerHTML='<td><strong>'+esc(session.display_name)+'</strong><br><span class="muted">'+esc(session.email||'')+'</span></td><td><span class="device">'+esc(device(session.user_agent))+'</span><br><span class="muted">Microsoft</span></td><td>'+date(session.created_at)+'</td><td>'+date(session.last_seen_at)+'</td><td>'+date(session.expires_at)+'</td><td>'+(session.current?'<span class="tag current">Esta sesión</span>':'<button class="danger compact" data-close>Cerrar</button>')+'</td>';const button=row.querySelector('[data-close]');if(button)button.onclick=function(){closeSession(session);};body.appendChild(row);});}
    function drawActivity(){const body=document.querySelector('#activity');body.innerHTML='';if(!events.length){body.innerHTML='<tr><td colspan="5" class="muted">Todavía no hay actividad registrada.</td></tr>';return;}events.forEach(function(event){const row=document.createElement('tr');row.innerHTML='<td>'+date(event.created_at)+'</td><td><strong>'+esc(event.actor_name||'Sistema')+'</strong><br><span class="muted">'+esc(event.actor_email||'')+'</span></td><td><span class="event">'+esc(actionLabel(event.action))+'</span></td><td>'+esc(event.target_type||'')+(event.target_id?' · '+esc(event.target_id):'')+'</td><td class="detail">'+esc(detailText(event))+'</td>';body.appendChild(row);});}
    async function api(path,options){const response=await fetch(path,options);if(!response.ok){let problem={};try{problem=await response.json();}catch(_){}throw new Error(problem.error||'No se pudo completar la operación.');}return response.json();}
    async function loadUsers(){data=await api('/api/admin/users');drawUsers();}
    async function loadSessions(){const result=await api('/api/admin/sessions');sessions=result.sessions||[];drawSessions();}
    async function loadActivity(){const result=await api('/api/admin/activity');events=result.events||[];drawActivity();}
    async function saveUser(row,user){try{const body={id:user.id,displayName:row.querySelector('[data-field="displayName"]').value,email:row.querySelector('[data-field="email"]').value,legacyUsername:user.legacy_username||'',role:row.querySelector('[data-field="role"]').value,active:row.querySelector('[data-field="active"]').value==='1'};await api('/api/admin/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});for(const app of data.applications){await api('/api/admin/permissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:user.id,applicationCode:app.code,role:'user',active:row.querySelector('[data-app="'+app.code+'"]').checked})});}show('Cambios guardados y aplicados.');await Promise.all([loadUsers(),loadSessions(),loadActivity()]);}catch(error){show(error.message);}}
    async function closeSession(session){if(!confirm('¿Cerrar la sesión de '+session.display_name+'?'))return;try{await api('/api/admin/sessions/'+session.id,{method:'DELETE'});show('Sesión cerrada.');await Promise.all([loadSessions(),loadActivity()]);}catch(error){show(error.message);}}
    async function closeUserSessions(user){if(!confirm('¿Cerrar todas las sesiones de '+user.display_name+'?'))return;try{const result=await api('/api/admin/users/'+user.id+'/sessions',{method:'DELETE'});show((result.count||0)+' sesiones cerradas.');await Promise.all([loadSessions(),loadActivity()]);}catch(error){show(error.message);}}
    async function removeUser(user){if(!confirm('¿Borrar definitivamente a '+user.display_name+'? Se eliminarán sus permisos y sesiones.'))return;try{await api('/api/admin/users/'+user.id,{method:'DELETE'});show('Usuario borrado.');await Promise.all([loadUsers(),loadSessions(),loadActivity()]);}catch(error){show(error.message);}}
    document.querySelectorAll('[data-tab]').forEach(function(button){button.onclick=function(){document.querySelectorAll('[data-tab]').forEach(function(item){item.classList.toggle('active',item===button);});document.querySelectorAll('[data-section]').forEach(function(section){section.classList.toggle('hidden',section.dataset.section!==button.dataset.tab);});};});
    document.querySelector('#newUser').onclick=async function(){const displayName=prompt('Nombre del usuario');if(!displayName)return;const email=prompt('Correo corporativo de Microsoft')||'';try{await api('/api/admin/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:displayName,email:email,role:'user',active:true})});show('Usuario creado.');await Promise.all([loadUsers(),loadActivity()]);}catch(error){show(error.message);}};
    document.querySelector('#closeOtherSessions').onclick=async function(){if(!confirm('¿Cerrar tus demás sesiones y mantener solamente esta?'))return;try{const result=await api('/api/admin/sessions',{method:'DELETE'});show((result.count||0)+' sesiones cerradas.');await Promise.all([loadSessions(),loadActivity()]);}catch(error){show(error.message);}};
    document.querySelector('#refreshActivity').onclick=function(){loadActivity().catch(function(error){show(error.message);});};
    Promise.all([loadUsers(),loadSessions(),loadActivity()]).catch(function(error){show(error.message);});
  </script>
</body>
</html>`;
}

function renderAdminPage(user) {
  const safeName = escapeHtml(user.displayName || user.username || "Administrador");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Usuarios y permisos</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#17202a;background:#f6f3ee}*{box-sizing:border-box}body{margin:0}.wrap{width:min(1180px,calc(100% - 32px));margin:32px auto}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}h1{margin:0;color:#8f1724}.button,button{border:0;border-radius:12px;padding:11px 16px;background:#a7192b;color:white;font-weight:800;text-decoration:none;cursor:pointer}.secondary{background:#fff;color:#25364a;border:1px solid #d9d0c5}.danger{background:#fff;color:#a7192b;border:1px solid #d8a5ad}.actions{display:grid;gap:8px}.panel{background:#fff;border:1px solid #e3d9ce;border-radius:20px;padding:22px;box-shadow:0 16px 40px rgba(31,41,55,.08)}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 9px;border-bottom:1px solid #eee4da;vertical-align:top}input,select{width:100%;padding:9px;border:1px solid #d8cec2;border-radius:9px;background:white}.apps{display:grid;gap:10px;min-width:230px}.perm{display:grid;grid-template-columns:22px 1fr;align-items:center;gap:7px}.notice{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:#fff4ce;color:#684d00}.muted{color:#6b7280;font-size:13px}@media(max-width:850px){.table-wrap{overflow:auto}table{min-width:850px}}</style></head><body><main class="wrap"><div class="top"><div><p class="muted">Sesión: ${safeName}</p><h1>Usuarios y permisos</h1></div><a class="button secondary" href="/">Volver al portal</a></div><div id="notice" class="notice" hidden></div><section class="panel"><button id="newUser">Añadir usuario</button><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Email Microsoft</th><th>Acceso</th><th>Estado</th><th>Aplicaciones</th><th></th></tr></thead><tbody id="users"></tbody></table></div></section></main><script>
  let data={users:[],applications:[],permissions:[]};const tbody=document.querySelector('#users');const notice=document.querySelector('#notice');
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function permission(userId,code){return data.permissions.find(p=>Number(p.user_id)===Number(userId)&&p.application_code===code);}
  function draw(){tbody.innerHTML='';data.users.forEach(user=>{const row=document.createElement('tr');row.innerHTML='<td><input data-field="displayName" value="'+esc(user.display_name)+'"><span class="muted">'+(user.entra_oid?'Microsoft vinculado':'Pendiente de primer acceso Microsoft')+'</span></td><td><input data-field="email" type="email" placeholder="nombre@empresa.es" value="'+esc(user.email||'')+'"></td><td><select data-field="role"><option value="user">Usuario</option><option value="admin">Administrador</option></select></td><td><select data-field="active"><option value="1">Activo</option><option value="0">Desactivado</option></select></td><td><div class="apps">'+data.applications.map(app=>{const p=permission(user.id,app.code);return '<label class="perm"><input type="checkbox" data-app="'+esc(app.code)+'" '+(p&&Number(p.active)?'checked':'')+'><span>'+esc(app.name)+'</span></label>';}).join('')+'</div></td><td><div class="actions"><button data-save>Guardar</button><button class="danger" data-delete>Borrar</button></div></td>';row.querySelector('[data-field="role"]').value=user.role;row.querySelector('[data-field="active"]').value=String(Number(user.active));row.querySelector('[data-save]').onclick=()=>save(row,user);row.querySelector('[data-delete]').onclick=()=>removeUser(user);tbody.appendChild(row);});}
  async function load(){const response=await fetch('/api/admin/users');if(!response.ok)throw new Error('No se pudieron cargar los usuarios.');data=await response.json();draw();}
  async function save(row,user){const body={id:user.id,displayName:row.querySelector('[data-field="displayName"]').value,email:row.querySelector('[data-field="email"]').value,legacyUsername:user.legacy_username||'',role:row.querySelector('[data-field="role"]').value,active:row.querySelector('[data-field="active"]').value==='1'};const response=await fetch('/api/admin/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok){const problem=await response.json();return show(problem.error||'No se pudo guardar.');}for(const app of data.applications){await fetch('/api/admin/permissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:user.id,applicationCode:app.code,role:'user',active:row.querySelector('[data-app="'+app.code+'"]').checked})});}show('Cambios guardados y aplicados a la base de datos.');await load();}
  async function removeUser(user){if(!confirm('¿Borrar definitivamente a '+user.display_name+'? Se cerrarán sus sesiones y se eliminarán sus permisos.'))return;const response=await fetch('/api/admin/users/'+user.id,{method:'DELETE'});if(!response.ok){const problem=await response.json();return show(problem.error||'No se pudo borrar.');}show('Usuario borrado.');await load();}
  function show(message){notice.textContent=message;notice.hidden=false;}
  document.querySelector('#newUser').onclick=async()=>{const displayName=prompt('Nombre del usuario');if(!displayName)return;const email=prompt('Correo corporativo de Microsoft')||'';const response=await fetch('/api/admin/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName,email,role:'user',active:true})});if(!response.ok){const problem=await response.json();return show(problem.error||'No se pudo crear.');}await load();};load().catch(error=>show(error.message));
  </script></body></html>`;
}

function normalizeUser(row) {
  return {
    id: Number(row.id),
    username: row.legacy_username || row.email || row.display_name,
    displayName: row.display_name,
    email: row.email || "",
    role: row.role === "admin" ? "admin" : "user",
    active: Boolean(Number(row.active)),
    tenantId: row.entra_tenant_id || "",
    oid: row.entra_oid || "",
    provider: row.provider || row.auth_provider || "local",
    sessionId: Number(row.session_id || 0),
  };
}

function entraEnabled(env) {
  return String(env?.ENTRA_ENABLED || "false").toLowerCase() === "true";
}

function sanitizeNextPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function readCookie(request, name) {
  const cookies = String(request.headers.get("cookie") || "").split(";");
  for (const cookie of cookies) {
    const index = cookie.indexOf("=");
    if (index > -1 && cookie.slice(0, index).trim() === name) return cookie.slice(index + 1).trim();
  }
  return "";
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function randomToken(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Text(value) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function secureTextEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([sha256Text(left), sha256Text(right)]);
  if (leftHash.length !== rightHash.length) return false;
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  }
  return difference === 0;
}

function base64Url(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
