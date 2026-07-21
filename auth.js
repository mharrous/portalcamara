const SESSION_COOKIE = "portal_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const MICROSOFT_START_PATH = "/api/auth/microsoft/start";
const MICROSOFT_CALLBACK_PATH = "/api/auth/microsoft/callback";
const ADMIN_PATH = "/admin/users";

export function authConfigurationError(env) {
  if (!env?.AUTH_DB) return "Falta enlazar la base de datos AUTH_DB.";
  if (localLoginEnabled(env) && (!env.AUTH_SECRET || !env.AUTH_USERS)) {
    return "Faltan AUTH_SECRET o AUTH_USERS para el acceso local de emergencia.";
  }
  if (entraEnabled(env) && (!env.ENTRA_TENANT_ID || !env.ENTRA_CLIENT_ID || !env.ENTRA_CLIENT_SECRET || !env.ENTRA_REDIRECT_URI)) {
    return "Falta completar la configuración de Microsoft Entra.";
  }
  return "";
}

export function loginOptions(env, showLocal = false) {
  const microsoftEnabled = entraEnabled(env);
  return {
    microsoftEnabled,
    localEnabled: localLoginEnabled(env) && (showLocal || !microsoftEnabled),
    microsoftStartPath: MICROSOFT_START_PATH,
  };
}

export async function handleAuthRoute(request, env, renderers) {
  const url = new URL(request.url);

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
    return renderers.html(renderAdminPage(user));
  }
  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    return withAdmin(request, env, async () => json(await listAdministrationData(env)));
  }
  if (url.pathname === "/api/admin/users" && request.method === "POST") {
    return withAdmin(request, env, (admin) => saveUser(request, env, admin));
  }
  if (url.pathname === "/api/admin/permissions" && request.method === "POST") {
    return withAdmin(request, env, (admin) => savePermission(request, env, admin));
  }
  const deleteUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (deleteUserMatch && request.method === "DELETE") {
    return withAdmin(request, env, (admin) => deleteUser(Number(deleteUserMatch[1]), env, admin));
  }
  return null;
}

export async function loginWithPassword(request, env, renderLogin) {
  if (!localLoginEnabled(env)) return renderLogin({ error: "El acceso local está desactivado." }, 403);
  const form = await request.formData();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const next = sanitizeNextPath(String(form.get("next") || "/"));
  const legacyUser = await validateLegacyCredentials(username, password, env);

  if (!legacyUser) {
    return renderLogin({ error: "Usuario o contraseña incorrectos.", username, next }, 401);
  }

  const user = await ensureLegacyUser(legacyUser, env);
  if (!user?.active) return renderLogin({ error: "Este usuario está desactivado.", username, next }, 403);
  const cookie = await createDatabaseSession(user.id, "local", env);
  return redirect(next, { "set-cookie": cookie });
}

export async function logoutResponse(request, env, destination = "/login") {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.AUTH_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Text(token)).run();
  return redirect(destination, { "set-cookie": clearSessionCookie() });
}

export async function getSessionUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Text(token);
  const row = await env.AUTH_DB.prepare(`
    SELECT u.id, u.legacy_username, u.display_name, u.email, u.role, u.active,
           u.entra_tenant_id, u.entra_oid, s.provider, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first();

  if (row) {
    if (!Number(row.active)) {
      await env.AUTH_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
      return null;
    }
    await env.AUTH_DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?").bind(tokenHash).run();
    return normalizeUser(row);
  }

  if (!env.AUTH_SECRET) return null;
  const legacy = await verifyLegacySessionToken(token, env.AUTH_SECRET);
  if (!legacy) return null;
  const user = await ensureLegacyUser(legacy, env);
  return user?.active ? user : null;
}

export async function allowedApplicationCodes(user, env) {
  if (user.role === "admin") {
    const result = await env.AUTH_DB.prepare("SELECT code FROM applications WHERE active = 1 ORDER BY code").all();
    return new Set((result.results || []).map((row) => row.code));
  }
  const result = await env.AUTH_DB.prepare(`
    SELECT p.application_code AS code
    FROM user_application_permissions p
    JOIN applications a ON a.code = p.application_code
    WHERE p.user_id = ? AND p.active = 1 AND a.active = 1
  `).bind(user.id).all();
  return new Set((result.results || []).map((row) => row.code));
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
  if (oauthError) return renderers.html(renderers.forbidden("Microsoft no pudo completar el acceso."), { status: 401 });
  if (!state || !code) return renderers.html(renderers.forbidden("La respuesta de Microsoft no es válida."), { status: 400 });

  const stateHash = await sha256Text(state);
  const saved = await env.AUTH_DB.prepare(`
    DELETE FROM oauth_states
    WHERE state_hash = ? AND expires_at > CURRENT_TIMESTAMP
    RETURNING code_verifier, nonce, return_to
  `).bind(stateHash).first();
  if (!saved) return renderers.html(renderers.forbidden("El intento de acceso ha caducado o ya fue utilizado."), { status: 400 });

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
  if (!tokenResponse.ok) return renderers.html(renderers.forbidden("Microsoft rechazó el intercambio de autorización."), { status: 401 });
  const tokens = await tokenResponse.json();
  const claims = await validateIdToken(tokens.id_token, env, saved.nonce);
  const user = await findAndLinkMicrosoftUser(claims, env);
  if (!user) return renderers.html(renderers.forbidden("Tu cuenta no ha sido autorizada por un administrador."), { status: 403 });
  if (!user.active) return renderers.html(renderers.forbidden("Tu usuario está desactivado."), { status: 403 });
  const cookie = await createDatabaseSession(user.id, "microsoft", env);
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

async function ensureLegacyUser(legacyUser, env) {
  const role = legacyUser.role === "admin" ? "admin" : "user";
  let row = await env.AUTH_DB.prepare("SELECT * FROM users WHERE lower(legacy_username) = lower(?)").bind(legacyUser.username).first();
  if (!row) {
    const inserted = await env.AUTH_DB.prepare(`
      INSERT INTO users (legacy_username, display_name, role, active, auth_provider, last_login_at)
      VALUES (?, ?, ?, 1, 'local', CURRENT_TIMESTAMP)
      RETURNING *
    `).bind(legacyUser.username, legacyUser.username, role).first();
    row = inserted;
    const applications = await env.AUTH_DB.prepare("SELECT code FROM applications WHERE active = 1").all();
    if (role !== "admin") {
      for (const application of applications.results || []) {
        await env.AUTH_DB.prepare(`
          INSERT OR IGNORE INTO user_application_permissions (user_id, application_code, role, active)
          VALUES (?, ?, 'user', 1)
        `).bind(row.id, application.code).run();
      }
    }
  } else {
    await env.AUTH_DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  }
  return normalizeUser(row);
}

async function createDatabaseSession(userId, provider, env) {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.AUTH_DB.prepare("INSERT INTO sessions (token_hash, user_id, provider, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256Text(token), userId, provider, expiresAt),
  ]);
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function validateLegacyCredentials(username, password, env) {
  let users;
  try {
    users = JSON.parse(env.AUTH_USERS || "[]");
  } catch {
    return null;
  }
  const user = users.find((item) => String(item.username || "").toLowerCase() === username.toLowerCase());
  if (!user?.passwordHash || !user?.role) return null;
  return (await verifyPassword(password, user.passwordHash)) ? { username: user.username, role: user.role } : null;
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
    env.AUTH_DB.prepare("SELECT code, name, category, url, active, controlled, integration_status FROM applications ORDER BY category, name"),
    env.AUTH_DB.prepare("SELECT user_id, application_code, role, active FROM user_application_permissions"),
  ]);
  return { users: users.results || [], applications: applications.results || [], permissions: permissions.results || [] };
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
  };
}

function entraEnabled(env) {
  return String(env?.ENTRA_ENABLED || "false").toLowerCase() === "true";
}

function localLoginEnabled(env) {
  return String(env?.LOCAL_LOGIN_ENABLED ?? "true").toLowerCase() !== "false";
}

function sanitizeNextPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
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

async function verifyPassword(password, passwordHash) {
  const parts = String(passwordHash).split("$");
  if (parts[0] === "sha256" && parts.length === 3) {
    const salt = base64UrlDecode(parts[1]);
    const expected = base64UrlDecode(parts[2]);
    const passwordBytes = new TextEncoder().encode(password);
    const payload = new Uint8Array(salt.length + passwordBytes.length);
    payload.set(salt); payload.set(passwordBytes, salt.length);
    return constantTimeEqual(new Uint8Array(await crypto.subtle.digest("SHA-256", payload)), expected);
  }
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlDecode(parts[2]), iterations }, key, base64UrlDecode(parts[3]).length * 8);
  return constantTimeEqual(new Uint8Array(derived), base64UrlDecode(parts[3]));
}

async function verifyLegacySessionToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts[0])));
  if (!constantTimeEqual(new TextEncoder().encode(parts[1]), new TextEncoder().encode(expected))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    if (!payload.username || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { username: String(payload.username), role: payload.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

function constantTimeEqual(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index] ^ second[index];
  return difference === 0;
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
