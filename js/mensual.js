import { listenVisitasRango, rangoMes, formatearFecha, colorClaseIglesia } from "./visitas.js";
import { listenContactosRango } from "./miembros.js";
import { abrirDetalleVisita } from "./modal.js";
import { listenPeticionesRespondidas } from "./peticiones.js";
import { escapeHtml, nombreMes } from "./util.js";

const COLORES = { "Molinuevo": "#c9a35e", "Luz de Ozama": "#4c7a9e", "Effatá": "#7a4c8e" };

export function initMensual() {
  const hoy = new Date();
  let year = hoy.getFullYear();
  let month = hoy.getMonth();
  let filtro = "Todas";
  let unsubscribeVisitas = null;
  let unsubscribeContactos = null;
  let visitasCache = [];
  let contactosCache = [];
  let chart = null;
  let chartLlamadas = null;

  const mesLabel = document.getElementById("mes-label");
  const listaEl = document.getElementById("lista-mensual");
  const listaLlamadasEl = document.getElementById("lista-llamadas-mensual");
  const filtroTabs = document.querySelectorAll("#filtro-iglesia .church-tab");

  function cargarMes() {
    if (unsubscribeVisitas) unsubscribeVisitas();
    if (unsubscribeContactos) unsubscribeContactos();
    mesLabel.textContent = nombreMes(year, month);
    const { inicio, fin } = rangoMes(year, month);
    unsubscribeVisitas = listenVisitasRango(inicio, fin, (visitas) => {
      visitasCache = visitas;
      render();
    });
    unsubscribeContactos = listenContactosRango(inicio, fin, (contactos) => {
      contactosCache = contactos;
      renderLlamadas();
    });
  }

  function render() {
    const filtradas = filtro === "Todas" ? visitasCache : visitasCache.filter((v) => v.iglesia === filtro);
    listaEl.innerHTML =
      filtradas.length === 0
        ? `<div class="empty-state"><div class="glyph">📋</div>Sin visitas registradas este mes${filtro !== "Todas" ? " para " + filtro : ""}.</div>`
        : filtradas.map(itemHtml).join("");
    renderChart(visitasCache, "grafico-pastel", "leyenda-pastel", (c) => (chart = c), () => chart);
  }

  function renderLlamadas() {
    const filtradas = filtro === "Todas" ? contactosCache : contactosCache.filter((c) => c.iglesia === filtro);
    listaLlamadasEl.innerHTML =
      filtradas.length === 0
        ? `<div class="empty-state"><div class="glyph">📞</div>Sin llamadas o mensajes registrados este mes${filtro !== "Todas" ? " para " + filtro : ""}.</div>`
        : filtradas.map(itemHtmlLlamada).join("");
    renderChart(contactosCache, "grafico-pastel-llamadas", "leyenda-pastel-llamadas", (c) => (chartLlamadas = c), () => chartLlamadas);
  }

  function renderChart(items, canvasId, leyendaId, setChart, getChart) {
    const counts = { "Molinuevo": 0, "Luz de Ozama": 0, "Effatá": 0 };
    items.forEach((v) => { if (counts[v.iglesia] !== undefined) counts[v.iglesia]++; });
    const labels = Object.keys(counts);
    const data = labels.map((l) => counts[l]);
    const total = data.reduce((a, b) => a + b, 0);
    const leyendaEl = document.getElementById(leyendaId);
    const canvas = document.getElementById(canvasId);

    if (getChart()) { getChart().destroy(); setChart(null); }

    if (total === 0) {
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      leyendaEl.innerHTML = `<div class="empty-state" style="padding:8px 0;">Sin datos este mes.</div>`;
      return;
    }

    setChart(new Chart(canvas, {
      type: "pie",
      data: {
        labels,
        datasets: [{ data, backgroundColor: labels.map((l) => COLORES[l]), borderWidth: 2, borderColor: "#fff" }],
      },
      options: { plugins: { legend: { display: false } }, responsive: false },
    }));

    leyendaEl.innerHTML = labels
      .map((l, i) => `
        <div class="legend-item">
          <span class="sw" style="background:${COLORES[l]}"></span>
          ${l}: ${data[i]} (${Math.round((data[i] / total) * 100)}%)
        </div>`)
      .join("");
  }

  function itemHtml(v) {
    const estadoLabel = v.estado === "completada" ? "Completada" : v.estado === "reprogramada" ? "Reprogramada" : "Pendiente";
    return `
      <li class="visit-item" data-id="${v.id}">
        <span class="church-dot ${colorClaseIglesia(v.iglesia)}"></span>
        <div class="info">
          <div class="name">${escapeHtml(v.feligres?.nombre || "(sin nombre)")}</div>
          <div class="meta">${escapeHtml(v.iglesia)} · ${formatearFecha(v.fecha)}</div>
        </div>
        <span class="badge badge-${v.estado}">${estadoLabel}</span>
      </li>
    `;
  }

  function itemHtmlLlamada(c) {
    const esLlamada = c.tipo === "llamada";
    return `
      <li class="visit-item">
        <span class="church-dot ${colorClaseIglesia(c.iglesia)}"></span>
        <div class="info">
          <div class="name">${escapeHtml(c.nombre || "(sin nombre)")}</div>
          <div class="meta">${escapeHtml(c.iglesia)} · ${formatearFecha(c.fecha)}</div>
        </div>
        <span class="badge badge-${esLlamada ? "pendiente" : "en_progreso"}">${esLlamada ? "📞 Llamada" : "💬 Mensaje"}</span>
      </li>
    `;
  }

  listaEl.addEventListener("click", (e) => {
    const li = e.target.closest(".visit-item");
    if (!li) return;
    const visita = visitasCache.find((v) => v.id === li.dataset.id);
    if (visita) abrirDetalleVisita(visita);
  });

  filtroTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filtroTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      filtro = tab.dataset.value;
      render();
      renderLlamadas();
    });
  });

  document.querySelectorAll("#mensual-subtabs .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#mensual-subtabs .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".mensual-subview").forEach((v) => v.classList.remove("active"));
      document.getElementById(`subview-mensual-${tab.dataset.subview}`).classList.add("active");
    });
  });

  document.getElementById("mes-prev").addEventListener("click", () => {
    month--;
    if (month < 0) { month = 11; year--; }
    cargarMes();
  });
  document.getElementById("mes-next").addEventListener("click", () => {
    month++;
    if (month > 11) { month = 0; year++; }
    cargarMes();
  });

  listenPeticionesRespondidas(renderOracionesRespondidas);

  cargarMes();
}

function renderOracionesRespondidas(peticiones) {
  const el = document.getElementById("lista-oraciones-respondidas");
  if (!el) return;

  const ordenadas = [...peticiones].sort(
    (a, b) => (b.actualizadoEn?.toMillis?.() || 0) - (a.actualizadoEn?.toMillis?.() || 0)
  );

  el.innerHTML =
    ordenadas.length === 0
      ? `<div class="empty-state"><div class="glyph">🙏</div>Aún no tienes peticiones marcadas como respondidas.</div>`
      : ordenadas
          .map(
            (p) => `
      <li class="visit-item">
        <div class="info">
          <div class="name">${escapeHtml(p.texto)}</div>
          <div class="meta">${p.deQuien ? escapeHtml(p.deQuien) : "Sin nombre"}</div>
        </div>
        <span class="badge badge-completada">Respondida</span>
      </li>`
          )
          .join("");
}
