import {
  listenVisitasHoy,
  listenVisitasRango,
  listenSeguimientosPendientes,
  rangoMes,
  marcarCompletada,
  formatearHora,
  colorClaseIglesia,
} from "./visitas.js";
import { abrirDetalleVisita } from "./modal.js";
import { listenMiembros } from "./miembros.js";
import { mostrarToast } from "./toast.js";
import { escapeHtml, saludoSegunHora, fechaLarga } from "./util.js";
import { notificarVisitasHoy } from "./notificaciones.js";
import { versiculoDeHoy } from "./versiculos.js";

let visitasHoyCache = [];
let seguimientosVisitasCache = [];
let miembrosContactoCache = [];

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
    const completadas = visitasMes.filter((v) => v.estado === "completada").length;
    const pendientes = visitasMes.filter((v) => v.estado !== "completada").length;
    document.getElementById("stat-row").innerHTML = `
      <div class="stat-pill"><div class="num">${visitasMes.length}</div><div class="label">Visitas este mes</div></div>
      <div class="stat-pill"><div class="num">${completadas}</div><div class="label">Completadas</div></div>
      <div class="stat-pill"><div class="num">${pendientes}</div><div class="label">Pendientes</div></div>
    `;
  });

  listenSeguimientosPendientes((visitas) => {
    seguimientosVisitasCache = visitas;
    renderRecordatorioContacto();
  });
  listenMiembros((miembros) => {
    miembrosContactoCache = miembros;
    renderRecordatorioContacto();
  });
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

function telefonoWhatsApp(telefono) {
  const digitos = (telefono || "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.length === 10 ? `1${digitos}` : digitos;
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
      nombre: v.feligres?.nombre,
      telefono: v.feligres?.telefono,
      iglesia: v.iglesia,
      detalle: v.motivo || "Seguimiento de visita",
    }));

  const deMiembros = miembrosContactoCache
    .filter((m) => esHoy(m.proximoContacto))
    .map((m) => ({
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
    <li class="visit-item">
      <span class="church-dot ${colorClaseIglesia(c.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(c.nombre || "(sin nombre)")}</div>
        <div class="meta">${escapeHtml(c.iglesia || "")} · ${escapeHtml(c.detalle)}</div>
      </div>
      <div class="actions" style="gap:6px;">
        ${numeroTel ? `<a class="btn btn-outline btn-llamar" href="tel:${numeroTel}">Llamar</a>` : ""}
        ${numeroWa ? `<a class="btn btn-whatsapp" href="https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        ${!numeroTel && !numeroWa ? `<span class="meta">Sin teléfono</span>` : ""}
      </div>
    </li>
  `;
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
