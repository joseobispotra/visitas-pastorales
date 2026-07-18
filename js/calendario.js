import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { IGLESIAS } from "./visitas.js";
import { cerrarModal } from "./modal.js";
import { mostrarToast } from "./toast.js";
import { escapeHtml } from "./util.js";

export const CATEGORIAS_EVENTO = ["Culto especial", "Bautismo", "Reunión de junta", "Actividad juvenil", "Campamento", "Otro"];
export const LUGARES_EVENTO = [...IGLESIAS, "General"];

const col = collection(db, "eventos");
let eventosCache = [];

function mapDoc(d) {
  return { id: d.id, ...d.data() };
}

export function listenEventos(callback) {
  const q = query(col, orderBy("fecha", "asc"));
  return onSnapshot(q, (snap) => {
    eventosCache = snap.docs.map(mapDoc);
    callback(eventosCache);
  });
}

/** Eventos de hoy en adelante, para el resumen de "Hoy". */
export function listenEventosProximos(callback) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const q = query(col, where("fecha", ">=", Timestamp.fromDate(inicioHoy)), orderBy("fecha", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map(mapDoc)));
}

export async function crearEvento(datos) {
  return addDoc(col, {
    titulo: datos.titulo,
    fecha: Timestamp.fromDate(datos.fecha),
    lugar: datos.lugar || "General",
    categoria: datos.categoria || "Otro",
    notas: datos.notas || "",
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

export async function actualizarEvento(id, datos) {
  return updateDoc(doc(db, "eventos", id), { ...datos, actualizadoEn: serverTimestamp() });
}

export async function eliminarEvento(id) {
  return deleteDoc(doc(db, "eventos", id));
}

function formatearFechaHora(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  const fechaTxt = d.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
  const horaTxt = d.toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });
  return `${fechaTxt} · ${horaTxt}`;
}

function toDateInputValue(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initCalendario() {
  const listaEl = document.getElementById("lista-eventos");
  document.getElementById("btn-nuevo-evento").addEventListener("click", () => abrirFormularioEvento());

  listenEventos((eventos) => {
    listaEl.innerHTML =
      eventos.length === 0
        ? `<div class="empty-state"><div class="glyph">🗓️</div>Aún no has agregado actividades. Comienza con "Nuevo evento".</div>`
        : eventos.map(itemHtml).join("");
  });

  listaEl.addEventListener("click", (e) => {
    const li = e.target.closest(".visit-item");
    if (!li) return;
    const evento = eventosCache.find((ev) => ev.id === li.dataset.id);
    if (evento) abrirFormularioEvento(evento);
  });
}

function itemHtml(ev) {
  const pasado = (ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)) < new Date();
  return `
    <li class="visit-item" data-id="${ev.id}"${pasado ? ' style="opacity:.6;"' : ""}>
      <div class="info">
        <div class="name">${escapeHtml(ev.titulo)}</div>
        <div class="meta">${escapeHtml(ev.lugar)} · ${escapeHtml(ev.categoria)}</div>
      </div>
      <span class="time-badge">${formatearFechaHora(ev.fecha)}</span>
      ${pasado ? `<span class="badge badge-reprogramada">Pasado</span>` : ""}
    </li>
  `;
}

function abrirFormularioEvento(evento = null) {
  document.getElementById("modal-titulo").textContent = evento ? "Editar evento" : "Nuevo evento";
  document.getElementById("modal-body").innerHTML = `
    <div class="form-grid">
      <div class="form-field full">
        <label>Título</label>
        <input type="text" id="ev-titulo" value="${escapeHtml(evento?.titulo || "")}">
      </div>
      <div class="form-field">
        <label>Fecha</label>
        <input type="date" id="ev-fecha" value="${evento ? toDateInputValue(evento.fecha) : ""}">
      </div>
      <div class="form-field">
        <label>Hora</label>
        <input type="time" id="ev-hora" value="${evento ? toTimeInputValue(evento.fecha) : "09:00"}">
      </div>
      <div class="form-field full">
        <label>Lugar</label>
        <div class="church-tabs" id="ev-lugar-tabs">
          ${LUGARES_EVENTO.map(
            (l) => `<div class="church-tab${(evento?.lugar || "General") === l ? " active" : ""}" data-value="${l}">${l}</div>`
          ).join("")}
        </div>
      </div>
      <div class="form-field full">
        <label>Categoría</label>
        <select id="ev-categoria">
          ${CATEGORIAS_EVENTO.map((c) => `<option ${evento?.categoria === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>
      <div class="form-field full">
        <label>Notas</label>
        <textarea id="ev-notas">${escapeHtml(evento?.notas || "")}</textarea>
      </div>
    </div>
    <div class="form-actions" style="justify-content:space-between;">
      ${evento ? `<button type="button" class="btn btn-outline" id="ev-eliminar">Eliminar</button>` : "<span></span>"}
      <button type="button" class="btn btn-solid" id="ev-guardar">${evento ? "Guardar cambios" : "Agregar evento"}</button>
    </div>
  `;

  let lugarSel = evento?.lugar || "General";
  document.querySelectorAll("#ev-lugar-tabs .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#ev-lugar-tabs .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      lugarSel = tab.dataset.value;
    });
  });

  document.getElementById("ev-guardar").addEventListener("click", async () => {
    const titulo = document.getElementById("ev-titulo").value.trim();
    const fechaVal = document.getElementById("ev-fecha").value;
    const horaVal = document.getElementById("ev-hora").value || "09:00";
    if (!titulo) {
      mostrarToast("Escribe el título del evento.");
      return;
    }
    if (!fechaVal) {
      mostrarToast("Selecciona la fecha.");
      return;
    }
    const [y, m, d] = fechaVal.split("-").map(Number);
    const [hh, mm] = horaVal.split(":").map(Number);
    const fecha = new Date(y, m - 1, d, hh, mm);
    const categoria = document.getElementById("ev-categoria").value;
    const notas = document.getElementById("ev-notas").value.trim();

    if (evento) {
      await actualizarEvento(evento.id, { titulo, fecha: Timestamp.fromDate(fecha), lugar: lugarSel, categoria, notas });
    } else {
      await crearEvento({ titulo, fecha, lugar: lugarSel, categoria, notas });
    }
    mostrarToast(evento ? "Evento actualizado." : "Evento agregado al calendario.");
    cerrarModal();
  });

  document.getElementById("ev-eliminar")?.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar "${evento.titulo}"?`)) return;
    await eliminarEvento(evento.id);
    mostrarToast("Evento eliminado.");
    cerrarModal();
  });

  document.getElementById("modal-backdrop").classList.add("open");
}
