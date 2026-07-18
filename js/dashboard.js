import {
  listenVisitasHoy,
  listenVisitasRango,
  listenSeguimientosPendientes,
  rangoMes,
  marcarCompletada,
  actualizarVisita,
  formatearHora,
  formatearFecha,
  colorClaseIglesia,
} from "./visitas.js";
import { abrirDetalleVisita } from "./modal.js";
import { listenMiembros, registrarContacto } from "./miembros.js";
import { mostrarToast } from "./toast.js";
import { escapeHtml, saludoSegunHora, fechaLarga, telefonoWhatsApp } from "./util.js";
import { notificarVisitasHoy } from "./notificaciones.js";
import { versiculoDeHoy } from "./versiculos.js";
import { listenEventosProximos } from "./calendario.js";
import { listenTemasPendientes } from "./junta.js";
import { listenTareasPendientes } from "./tareas.js";

let visitasHoyCache = [];
let seguimientosVisitasCache = [];
let miembrosContactoCache = [];
let visitasMesCache = [];
let eventosProximosCache = [];
let temasPendientesCache = [];
let tareasPendientesCache = [];

export function initDashboard() {
  document.getElementById("saludo-eyebrow").textContent = saludoSegunHora();
  document.getElementById("fecha-hoy").textContent = fechaLarga();
  renderVersiculo();

  const listaPendientesEl = document.getElementById("lista-hoy-pendientes");
  const listaCompletadasEl = document.getElementById("lista-hoy-completadas");
  const resumenEl = document.getElementById("resumen-hoy-line");

  listenVisitasHoy((visitas) => {
    visitasHoyCache = visitas;
    const pendientes = visitas.filter((v) => v.estado !== "completada");
    const completadas = visitas.filter((v) => v.estado === "completada");

    if (pendientes.length === 0 && completadas.length === 0) {
      resumenEl.textContent = "No tienes visitas agendadas para hoy. Buen momento para agendar una.";
    } else if (pendientes.length === 0) {
      resumenEl.textContent = "Ya completaste todas tus visitas de hoy. ¡Buen trabajo!";
    } else {
      resumenEl.textContent = `Tienes ${pendientes.length} visita${pendientes.length === 1 ? "" : "s"} pendiente${pendientes.length === 1 ? "" : "s"} para hoy.`;
    }

    listaPendientesEl.innerHTML =
      pendientes.length === 0
        ? `<div class="empty-state"><div class="glyph">🕊️</div>Sin visitas pendientes para hoy.</div>`
        : pendientes.map(itemHtml).join("");

    listaCompletadasEl.innerHTML =
      completadas.length === 0
        ? `<div class="empty-state"><div class="glyph">📋</div>Aún no completas ninguna visita hoy.</div>`
        : completadas.map(itemHtml).join("");

    notificarVisitasHoy(pendientes);
  });

  wireLista(listaPendientesEl);
  wireLista(listaCompletadasEl);

  const hoy = new Date();
  const { inicio, fin } = rangoMes(hoy.getFullYear(), hoy.getMonth());
  listenVisitasRango(inicio, fin, (visitasMes) => {
    visitasMesCache = visitasMes;
    const completadas = visitasMes.filter((v) => v.estado === "completada").length;
    const pendientes = visitasMes.filter((v) => v.estado !== "completada").length;
    document.getElementById("stat-row").innerHTML = `
      <div class="stat-pill" data-tipo="todas"><div class="num">${visitasMes.length}</div><div class="label">Visitas este mes</div></div>
      <div class="stat-pill" data-tipo="completada"><div class="num">${completadas}</div><div class="label">Completadas</div></div>
      <div class="stat-pill" data-tipo="pendiente"><div class="num">${pendientes}</div><div class="label">Pendientes</div></div>
    `;
  });
  wireStatRow();

  listenSeguimientosPendientes((visitas) => {
    seguimientosVisitasCache = visitas;
    renderRecordatorioContacto();
  });
  listenMiembros((miembros) => {
    miembrosContactoCache = miembros;
    renderRecordatorioContacto();
  });
  wireRecordatorioContacto();

  listenEventosProximos((eventos) => {
    eventosProximosCache = eventos;
    renderResumenGestion();
  });
  listenTemasPendientes((temas) => {
    temasPendientesCache = temas;
    renderResumenGestion();
  });
  listenTareasPendientes((tareas) => {
    tareasPendientesCache = tareas;
    renderResumenGestion();
  });
}

function renderResumenGestion() {
  const slot = document.getElementById("resumen-gestion-slot");
  if (!slot) return;
  slot.innerHTML = `
    <div class="card">
      <div class="page-header">
        <h2>Gestión</h2>
        <p>Resumen administrativo</p>
      </div>
      <div class="mini-stats">
        <a class="mini-stat" href="#/gestion"><div class="num">${eventosProximosCache.length}</div><div class="label">Próximos eventos</div></a>
        <a class="mini-stat" href="#/gestion"><div class="num">${temasPendientesCache.length}</div><div class="label">Temas de junta pendientes</div></a>
        <a class="mini-stat" href="#/gestion"><div class="num">${tareasPendientesCache.length}</div><div class="label">Tareas pendientes</div></a>
      </div>
    </div>
  `;
}

const ETIQUETAS_TIPO = {
  todas: "Visitas este mes",
  completada: "Completadas este mes",
  pendiente: "Pendientes este mes",
};

function wireStatRow() {
  const statRow = document.getElementById("stat-row");
  let timer = null;
  let activo = false;

  statRow.addEventListener("pointerdown", (e) => {
    const pill = e.target.closest(".stat-pill");
    if (!pill) return;
    activo = false;
    timer = setTimeout(() => {
      activo = true;
      mostrarPreviaMes(pill.dataset.tipo);
    }, 400);
  });

  const cancelar = () => {
    clearTimeout(timer);
    ocultarPreviaMes();
  };
  statRow.addEventListener("pointerup", cancelar);
  statRow.addEventListener("pointerleave", cancelar);
  statRow.addEventListener("pointercancel", cancelar);

  statRow.addEventListener("click", (e) => {
    const fueLongPress = activo;
    activo = false;
    if (fueLongPress) e.preventDefault();
  });
}

function mostrarPreviaMes(tipo) {
  const filtradas =
    tipo === "completada"
      ? visitasMesCache.filter((v) => v.estado === "completada")
      : tipo === "pendiente"
      ? visitasMesCache.filter((v) => v.estado !== "completada")
      : visitasMesCache;

  const preview = document.getElementById("stat-preview");
  preview.innerHTML = `
    <div class="stat-preview-title">${ETIQUETAS_TIPO[tipo] || "Visitas"}</div>
    ${
      filtradas.length === 0
        ? `<div class="stat-preview-empty">Sin visitas en esta categoría.</div>`
        : `<ul class="stat-preview-list">
            ${filtradas
              .map(
                (v) => `
              <li>
                <span class="church-dot ${colorClaseIglesia(v.iglesia)}"></span>
                <span class="stat-preview-nombre">${escapeHtml(v.feligres?.nombre || "(sin nombre)")}</span>
                <span class="stat-preview-fecha">${formatearFecha(v.fecha)} · ${formatearHora(v.fecha)}</span>
              </li>`
              )
              .join("")}
          </ul>`
    }
  `;
  preview.classList.add("show");
}

function ocultarPreviaMes() {
  document.getElementById("stat-preview").classList.remove("show");
}

function wireLista(listaEl) {
  listaEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const li = e.target.closest(".visit-item");
    const visita = visitasHoyCache.find((v) => v.id === li.dataset.id);
    if (!visita) return;

    if (btn.dataset.action === "ver") {
      abrirDetalleVisita(visita);
    } else if (btn.dataset.action === "completar") {
      if (confirm(`¿Marcar la visita a ${visita.feligres?.nombre || "este feligrés"} como completada?`)) {
        marcarCompletada(visita, {}).then(() => mostrarToast("Visita marcada como completada."));
      }
    }
  });
}

function renderVersiculo() {
  const v = versiculoDeHoy();
  document.getElementById("verse-card").innerHTML = `
    <div class="verse-icon">📖</div>
    <p class="verse-text">"${escapeHtml(v.texto)}"</p>
    <p class="verse-ref">${escapeHtml(v.referencia)} <span class="verse-copyright">· NVI © Biblica, Inc.®</span></p>
  `;
}

function esHoy(fecha) {
  if (!fecha) return false;
  const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
  return d.toDateString() === new Date().toDateString();
}

function renderRecordatorioContacto() {
  const deVisitas = seguimientosVisitasCache
    .filter((v) => esHoy(v.seguimiento?.fecha))
    .map((v) => ({
      origen: "visita",
      refId: v.id,
      nombre: v.feligres?.nombre,
      telefono: v.feligres?.telefono,
      iglesia: v.iglesia,
      detalle: v.motivo || "Seguimiento de visita",
    }));

  const deMiembros = miembrosContactoCache
    .filter((m) => esHoy(m.proximoContacto))
    .map((m) => ({
      origen: "miembro",
      refId: m.id,
      nombre: m.nombre,
      telefono: m.telefono,
      iglesia: m.iglesia,
      detalle: "Contacto programado",
    }));

  const todos = [...deVisitas, ...deMiembros];
  const slot = document.getElementById("seguimiento-card-slot");

  if (todos.length === 0) {
    slot.innerHTML = "";
    return;
  }

  slot.innerHTML = `
    <div class="card">
      <div class="page-header">
        <h2>Hoy debes contactar</h2>
        <p>Recuerda llamarles o escribirles hoy</p>
      </div>
      <ul class="visit-list">
        ${todos.map(contactoItemHtml).join("")}
      </ul>
    </div>
  `;
}

function contactoItemHtml(c) {
  const numeroWa = telefonoWhatsApp(c.telefono);
  const numeroTel = (c.telefono || "").replace(/\D/g, "");
  const mensaje = `Hola ${c.nombre || ""}, Dios te bendiga. Quería saber cómo estás, estoy orando por ti.`;
  return `
    <li class="visit-item" data-origen="${c.origen}" data-ref-id="${c.refId}">
      <span class="church-dot ${colorClaseIglesia(c.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(c.nombre || "(sin nombre)")}</div>
        <div class="meta">${escapeHtml(c.iglesia || "")} · ${escapeHtml(c.detalle)}</div>
      </div>
      <div class="actions" style="gap:6px;">
        ${numeroTel ? `<a class="btn btn-outline btn-llamar" href="tel:${numeroTel}">Llamar</a>` : ""}
        ${numeroWa ? `<a class="btn btn-whatsapp" href="https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        ${!numeroTel && !numeroWa ? `<span class="meta">Sin teléfono</span>` : ""}
        <button class="icon-btn" data-action="hecho" title="Marcar como realizado">✓</button>
      </div>
    </li>
  `;
}

function wireRecordatorioContacto() {
  document.getElementById("seguimiento-card-slot").addEventListener("click", async (e) => {
    const btn = e.target.closest('[data-action="hecho"]');
    if (!btn) return;
    const li = e.target.closest("[data-origen]");
    const origen = li.dataset.origen;
    const refId = li.dataset.refId;

    if (origen === "visita") {
      await actualizarVisita(refId, { "seguimiento.fecha": null });
      mostrarToast("Seguimiento marcado como realizado.");
    } else {
      await registrarContacto(refId, { tipo: "llamada", notas: "", proximoContacto: null });
      mostrarToast("Contacto marcado como realizado.");
    }
  });
}

function itemHtml(v) {
  return `
    <li class="visit-item" data-id="${v.id}">
      <span class="church-dot ${colorClaseIglesia(v.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(v.feligres?.nombre || "(sin nombre)")}</div>
        <div class="meta">${escapeHtml(v.iglesia)} · ${escapeHtml(v.motivo || "")}</div>
      </div>
      <span class="time-badge">${formatearHora(v.fecha)}</span>
      <div class="actions">
        <button class="icon-btn" data-action="ver" title="Ver detalle">👁</button>
        ${v.estado !== "completada" ? `<button class="icon-btn" data-action="completar" title="Marcar completada">✓</button>` : ""}
      </div>
    </li>
  `;
}
