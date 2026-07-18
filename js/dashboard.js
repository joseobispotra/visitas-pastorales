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
import { mostrarToast } from "./toast.js";
import { escapeHtml, saludoSegunHora, fechaLarga } from "./util.js";
import { notificarVisitasHoy } from "./notificaciones.js";
import { versiculoDeHoy } from "./versiculos.js";

let visitasHoyCache = [];

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

  listenSeguimientosPendientes(renderSeguimientoHoy);
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

function renderSeguimientoHoy(visitas) {
  const hoyStr = new Date().toDateString();
  const deHoy = visitas.filter((v) => {
    const f = v.seguimiento?.fecha;
    if (!f) return false;
    const d = f.toDate ? f.toDate() : new Date(f);
    return d.toDateString() === hoyStr;
  });

  const slot = document.getElementById("seguimiento-card-slot");
  if (deHoy.length === 0) {
    slot.innerHTML = "";
    return;
  }

  slot.innerHTML = `
    <div class="card">
      <div class="page-header">
        <h2>Seguimiento de hoy</h2>
        <p>Recuerda escribirles hoy para darles seguimiento</p>
      </div>
      <ul class="visit-list">
        ${deHoy.map(seguimientoItemHtml).join("")}
      </ul>
    </div>
  `;
}

function seguimientoItemHtml(v) {
  const numero = telefonoWhatsApp(v.feligres?.telefono);
  const mensaje = `Hola ${v.feligres?.nombre || ""}, quería saber cómo estás y darte seguimiento. Que Dios te bendiga.`;
  return `
    <li class="visit-item">
      <span class="church-dot ${colorClaseIglesia(v.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(v.feligres?.nombre || "(sin nombre)")}</div>
        <div class="meta">${escapeHtml(v.iglesia)} · ${escapeHtml(v.motivo || "")}</div>
      </div>
      ${
        numero
          ? `<a class="btn btn-whatsapp" href="https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">WhatsApp</a>`
          : `<span class="meta">Sin teléfono</span>`
      }
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
