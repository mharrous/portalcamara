const PROYECTOS = [
  {
    nombre: "Calendario de Eventos",
    categoria: "Eventos",
    url: "https://calendario.camaradeceuta.workers.dev/",
    estado: "activo",
  },
  {
    nombre: "Portal de Reuniones",
    categoria: "Interno",
    url: "https://reuniones.camaraceuta.workers.dev/",
    estado: "activo",
  },
  {
    nombre: "Portal Proyecto Innovación",
    categoria: "Interno",
    url: "https://proyectos-innovacion.camaraceuta.workers.dev/",
    estado: "activo",
  },
  {
    nombre: "Portal Proyectos Innovación",
    categoria: "Por definir",
    url: "https://portalproyectoscamara.camaraceuta.workers.dev/",
    estado: "activo",
  },
  {
    nombre: "Próximo proyecto",
    categoria: "Por definir",
    url: "",
    estado: "proximamente",
  },
];

const LOGO_CAMARA = "data:image/png;base64,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";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(renderHtml(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
};

function renderHtml() {
  const proyectosJson = JSON.stringify(PROYECTOS, null, 2).replace(/</g, "\u003c");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Portal de proyectos web de la Cámara de Ceuta.">
  <title>Portal de Proyectos | Cámara de Ceuta</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f5f2ed;
      --surface: #ffffff;
      --border: rgba(11, 45, 77, 0.12);
      --text: #111827;
      --text-soft: #667085;
      --text-faint: #98a2b3;
      --navy: #0b2d4d;
      --red: #e11d2f;
      --red-dark: #b91525;
      --gold: #d6b20e;
      --soon: #d7dde6;
      --radius: 18px;
    }

    * { box-sizing: border-box; }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at 8% -10%, rgba(225, 29, 47, 0.12), transparent 30%),
        radial-gradient(circle at 92% 4%, rgba(214, 178, 14, 0.16), transparent 32%),
        linear-gradient(180deg, #fbfaf7 0%, var(--bg) 100%);
      color: var(--text);
      font-family: "Inter", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    .glow {
      position: fixed;
      border-radius: 50%;
      filter: blur(90px);
      pointer-events: none;
      z-index: 0;
      opacity: 0.25;
    }

    .glow-a {
      width: 480px;
      height: 480px;
      top: -180px;
      left: -120px;
      background: radial-gradient(circle, var(--red), transparent 70%);
    }

    .glow-b {
      width: 520px;
      height: 520px;
      bottom: -220px;
      right: -160px;
      background: radial-gradient(circle, var(--gold), transparent 70%);
    }

    .page {
      position: relative;
      z-index: 1;
      width: min(1080px, calc(100% - 40px));
      margin: 0 auto;
      padding: 48px 0 56px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 28px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .logo-chip {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border: 1px solid rgba(11, 45, 77, 0.12);
      border-radius: 18px;
      background: #fff;
      flex-shrink: 0;
      overflow: hidden;
      box-shadow: 0 14px 30px rgba(11, 45, 77, 0.09);
    }

    .logo-chip img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 7px;
    }

    .kicker {
      margin: 0 0 4px;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--red);
    }

    h1 {
      margin: 0;
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      font-size: clamp(26px, 3.4vw, 36px);
      letter-spacing: -0.02em;
      color: var(--navy);
    }

    .stat {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 10px 20px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.86);
      box-shadow: 0 10px 28px rgba(11, 45, 77, 0.08);
    }

    .stat-value {
      font-family: "Space Grotesk", sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--red);
    }

    .stat-label {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-soft);
    }

    .controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 220px;
      gap: 14px;
      margin-bottom: 28px;
    }

    .field-search {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      height: 52px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 10px 28px rgba(11, 45, 77, 0.05);
    }

    .field-icon {
      width: 18px;
      height: 18px;
      color: var(--red);
      flex-shrink: 0;
    }

    .field-search input {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--text);
      font: 14px "Inter", sans-serif;
      outline: none;
    }

    .field-search input::placeholder { color: var(--text-faint); }

    .field-select {
      height: 52px;
      padding: 0 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.9);
      color: var(--text);
      font: 14px "Inter", sans-serif;
      outline: none;
      cursor: pointer;
      box-shadow: 0 10px 28px rgba(11, 45, 77, 0.05);
    }

    .field-search:focus-within,
    .field-select:focus {
      border-color: var(--red);
      box-shadow: 0 0 0 4px rgba(225, 29, 47, 0.08);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 18px;
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-height: 205px;
      padding: 22px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 250, 240, 0.9)),
        var(--surface);
      text-decoration: none;
      color: inherit;
      opacity: 0;
      transform: translateY(8px);
      animation: rise 0.45s ease forwards;
      box-shadow: 0 16px 36px rgba(11, 45, 77, 0.08);
      transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
    }

    @keyframes rise {
      to {
        opacity: 1;
        transform: none;
      }
    }

    .card-live { cursor: pointer; }

    .card-live:hover,
    .card-live:focus-visible {
      border-color: rgba(225, 29, 47, 0.42);
      transform: translateY(-3px);
      box-shadow: 0 18px 44px rgba(177, 21, 37, 0.16);
    }

    .card-live:focus-visible { outline: none; }
    .card-soon { opacity: 0.62; }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-icon {
      width: 42px;
      height: 42px;
      border-radius: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "Space Grotesk", sans-serif;
      font-weight: 700;
      font-size: 17px;
      color: #fff;
      background: linear-gradient(135deg, var(--navy), var(--red));
    }

    .card-soon .card-icon {
      background: var(--soon);
      color: var(--text-soft);
    }

    .card-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--gold);
      box-shadow: 0 0 0 4px rgba(214, 178, 14, 0.18);
    }

    .card-soon .card-dot {
      background: var(--text-faint);
      box-shadow: none;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .card-title {
      margin: 0;
      font-family: "Space Grotesk", sans-serif;
      font-size: 19px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--navy);
    }

    .card-tag {
      align-self: flex-start;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(11, 45, 77, 0.07);
      color: var(--navy);
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .card-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }

    .card-status {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--red);
    }

    .card-soon .card-status { color: var(--text-faint); }

    .card-cta {
      font-family: "Inter", sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: var(--navy);
      transition: transform 0.15s ease, color 0.15s ease;
    }

    .card-live:hover .card-cta,
    .card-live:focus-visible .card-cta {
      color: var(--red);
      transform: translateX(3px);
    }

    .empty-state {
      padding: 40px 0;
      text-align: center;
      color: var(--text-soft);
      font-size: 14px;
    }

    .footbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 40px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: var(--text-faint);
    }

    .footbar p { margin: 0; }

    @media (max-width: 640px) {
      .controls { grid-template-columns: 1fr; }
      .topbar { align-items: flex-start; }
    }

    @media (prefers-reduced-motion: reduce) {
      .card {
        animation: none;
        opacity: 1;
        transform: none;
      }
    }
  </style>
</head>
<body>
  <div class="glow glow-a"></div>
  <div class="glow glow-b"></div>

  <main class="page">
    <header class="topbar">
      <div class="brand">
        <span class="logo-chip"><img src="${LOGO_CAMARA}" alt="Cámara de Ceuta"></span>
        <div>
          <p class="kicker">Cámara de Ceuta</p>
          <h1>Portal</h1>
        </div>
      </div>
      <div class="stat">
        <span class="stat-value" id="liveCount">0</span>
        <span class="stat-label">activos</span>
      </div>
    </header>

    <section class="controls" aria-label="Filtros del portal">
      <label class="field-search">
        <svg class="field-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"></circle>
          <path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
        </svg>
        <input id="searchInput" type="search" placeholder="Buscar proyecto..." autocomplete="off">
      </label>

      <select id="categoryFilter" class="field-select" aria-label="Filtrar por categoría">
        <option value="todas">Todas las categorías</option>
      </select>
    </section>

    <section class="grid" aria-label="Listado de proyectos" id="projectGrid"></section>
    <p class="empty-state" id="emptyState" hidden>No hay proyectos que coincidan con la búsqueda.</p>

    <footer class="footbar">
      <p>Actualizado el <span id="today"></span></p>
      <p>Añade proyectos nuevos editando <strong>PROYECTOS</strong> al principio de <strong>worker.js</strong></p>
    </footer>
  </main>

  <script>
    const PROYECTOS = ${proyectosJson};
    const gridContainer = document.getElementById("projectGrid");
    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const emptyState = document.getElementById("emptyState");
    const liveCountEl = document.getElementById("liveCount");
    const todayLabel = document.getElementById("today");

    function removeInstallPromptArtifacts() {
      document.querySelectorAll("body *").forEach(function(element) {
        const text = element.textContent || "";
        if (text.includes("Instalar como aplicación") || text.includes("Instalar este sitio como una aplicación")) {
          element.remove();
        }
      });
    }

    function normalizeText(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    }

    function projectIsActive(project) {
      const url = String(project.url || "").trim();
      return project.estado === "activo" && (url.startsWith("https://") || url.startsWith("http://"));
    }

    function statusLabel(project) {
      return projectIsActive(project) ? "En línea" : "Próximamente";
    }

    function initial(name) {
      return String(name || "?").trim().charAt(0).toUpperCase();
    }

    function createTextElement(tag, className, text) {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = text;
      return element;
    }

    function createProjectCard(project, index) {
      const isLive = projectIsActive(project);
      const card = document.createElement(isLive ? "a" : "article");

      if (isLive) {
        card.href = project.url;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.setAttribute("aria-label", "Abrir " + project.nombre + " en una pestaña nueva");
      }

      card.className = "card " + (isLive ? "card-live" : "card-soon");
      card.style.animationDelay = String(index * 60) + "ms";

      const top = document.createElement("div");
      top.className = "card-top";
      top.appendChild(createTextElement("span", "card-icon", initial(project.nombre)));
      top.appendChild(createTextElement("span", "card-dot", ""));

      const body = document.createElement("div");
      body.className = "card-body";
      body.appendChild(createTextElement("h3", "card-title", project.nombre));
      body.appendChild(createTextElement("span", "card-tag", project.categoria));

      const foot = document.createElement("div");
      foot.className = "card-foot";
      foot.appendChild(createTextElement("span", "card-status", statusLabel(project)));
      foot.appendChild(createTextElement("span", "card-cta", isLive ? "Abrir ↗" : "—"));

      card.appendChild(top);
      card.appendChild(body);
      card.appendChild(foot);
      return card;
    }

    function fillCategoryFilter() {
      const categories = Array.from(new Set(PROYECTOS.map(function(project) { return project.categoria; })))
        .sort(function(first, second) { return first.localeCompare(second, "es"); });

      categories.forEach(function(category) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
      });
    }

    function filteredProjects() {
      const query = normalizeText(searchInput.value);
      const category = categoryFilter.value;

      return PROYECTOS.filter(function(project) {
        const matchesCategory = category === "todas" || project.categoria === category;
        const searchableText = normalizeText([
          project.nombre,
          project.categoria,
          project.estado,
          statusLabel(project),
        ].join(" "));

        return matchesCategory && searchableText.includes(query);
      });
    }

    function renderProjects() {
      const projects = filteredProjects();
      gridContainer.innerHTML = "";
      emptyState.hidden = projects.length > 0;

      projects.forEach(function(project, index) {
        gridContainer.appendChild(createProjectCard(project, index));
      });

      liveCountEl.textContent = PROYECTOS.filter(projectIsActive).length;
    }

    fillCategoryFilter();
    renderProjects();
    removeInstallPromptArtifacts();

    todayLabel.textContent = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    searchInput.addEventListener("input", renderProjects);
    categoryFilter.addEventListener("change", renderProjects);

    new MutationObserver(removeInstallPromptArtifacts).observe(document.body, {
      childList: true,
      subtree: true,
    });
  </script>
</body>
</html>`;
}
