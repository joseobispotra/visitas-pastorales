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
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { IGLESIAS, colorClaseIglesia } from "./visitas.js";
import { cerrarModal } from "./modal.js";
import { mostrarToast } from "./toast.js";
import { escapeHtml } from "./util.js";

export const ESTADOS_JUNTA = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "en_progreso", etiqueta: "En progreso" },
  { valor: "resuelto", etiqueta: "Resuelto" },
];

const col = collection(db, "temasJunta");
let temasCache = [];
let filtroIglesia = "todas";
let filtroEstado = "todos";

function mapDoc(d) {
  return { id: d.id, ...d.data() };
}

export function listenTemasJunta(callback) {
  const q = query(col, orderBy("creadoEn", "desc"));
  return onSnapshot(q, (snap) => {
    temasCache = snap.docs.map(mapDoc);
    callback(temasCache);
  });
}

/** Temas no resueltos, para el resumen de "Hoy". */
export function listenTemasPendientes(callback) {
  return listenTemasJunta((temas) => callback(temas.filter((t) => t.estado !== "resuelto")));
}

export async function crearTema(datos) {
  return addDoc(col, {
    titulo: datos.titulo,
    iglesia: datos.iglesia,
    estado: datos.estado || "pendiente",
    responsable: datos.responsable || "",
    fechaLimite: datos.fechaLimite ? Timestamp.fromDate(datos.fechaLimite) : null,
    notas: datos.notas || "",
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

export async function actualizarTema(id, datos) {
  return updateDoc(doc(db, "temasJunta", id), { ...datos, actualizadoEn: serverTimestamp() });
}

export async function eliminarTema(id) {
  return deleteDoc(doc(db, "temasJunta", id));
}

function etiquetaEstado(estado) {
  return ESTADOS_JUNTA.find((e) => e.valor === estado)?.etiqueta || "Pendiente";
}

function formatearFechaLimite(fecha) {
  if (!fecha) return "";
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  return d.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
}

function toDateInputValue(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function initJunta() {
  const listaEl = document.getElementById("lista-junta");
  document.getElementById("btn-nuevo-tema").addEventListener("click", () => abrirFormularioTema());

  listenTemasJunta((temas) => renderLista(listaEl, temas));

  document.querySelectorAll("#filtro-iglesia-junta .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#filtro-iglesia-junta .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      filtroIglesia = tab.dataset.value;
      renderLista(listaEl, temasCache);
    });
  });

  document.querySelectorAll("#filtro-estado-junta .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#filtro-estado-junta .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      filtroEstado = tab.dataset.value;
      renderLista(listaEl, temasCache);
    });
  });

  listaEl.addEventListener("click", (e) => {
    const li = e.target.closest(".visit-item");
    if (!li) return;
    const tema = temasCache.find((t) => t.id === li.dataset.id);
    if (tema) abrirFormularioTema(tema);
  });
}

function renderLista(listaEl, temas) {
  const filtrados = temas
    .filter((t) => filtroIglesia === "todas" || t.iglesia === filtroIglesia)
    .filter((t) => filtroEstado === "todos" || t.estado === filtroEstado);
  listaEl.innerHTML =
    filtrados.length === 0
      ? `<div class="empty-state"><div class="glyph">📋</div>No hay temas de junta en esta categoría.</div>`
      : filtrados.map(itemHtml).join("");
}

function itemHtml(t) {
  const vencimiento = formatearFechaLimite(t.fechaLimite);
  return `
    <li class="visit-item" data-id="${t.id}">
      <span class="church-dot ${colorClaseIglesia(t.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(t.titulo)}</div>
        <div class="meta">${escapeHtml(t.iglesia || "")}${t.responsable ? " · " + escapeHtml(t.responsable) : ""} · ${vencimiento ? "Límite: " + vencimiento : "Sin fecha límite"}</div>
      </div>
      <span class="badge badge-${t.estado}">${etiquetaEstado(t.estado)}</span>
    </li>
  `;
}

function abrirFormularioTema(tema = null) {
  document.getElementById("modal-titulo").textContent = tema ? "Editar tema de junta" : "Nuevo tema de junta";
  document.getElementById("modal-body").innerHTML = `
    <div class="form-grid">
      <div class="form-field full">
        <label>Título</label>
        <input type="text" id="tj-titulo" value="${escapeHtml(tema?.titulo || "")}">
      </div>
      <div class="form-field full">
        <label>Iglesia</label>
        <div class="church-tabs" id="tj-iglesia-tabs">
          ${IGLESIAS.map(
            (ig) => `<div class="church-tab${tema?.iglesia === ig ? " active" : ""}" data-value="${ig}">${ig}</div>`
          ).join("")}
        </div>
      </div>
      <div class="form-field full">
        <label>Estado</label>
        <div class="church-tabs" id="tj-estado-tabs">
          ${ESTADOS_JUNTA.map(
            (e) => `<div class="church-tab${(tema?.estado || "pendiente") === e.valor ? " active" : ""}" data-value="${e.valor}">${e.etiqueta}</div>`
          ).join("")}
        </div>
      </div>
      <div class="form-field">
        <label>Responsable</label>
        <input type="text" id="tj-responsable" value="${escapeHtml(tema?.responsable || "")}">
      </div>
      <div class="form-field">
        <label>Fecha límite (opcional)</label>
        <input type="date" id="tj-fecha-limite" value="${tema?.fechaLimite ? toDateInputValue(tema.fechaLimite) : ""}">
      </div>
      <div class="form-field full">
        <label>Notas</label>
        <textarea id="tj-notas">${escapeHtml(tema?.notas || "")}</textarea>
      </div>
    </div>
    <div class="form-actions" style="justify-content:space-between;">
      ${tema ? `<button type="button" class="btn btn-outline" id="tj-eliminar">Eliminar</button>` : "<span></span>"}
      <button type="button" class="btn btn-solid" id="tj-guardar">${tema ? "Guardar cambios" : "Agregar tema"}</button>
    </div>
  `;

  let iglesiaSel = tema?.iglesia || null;
  document.querySelectorAll("#tj-iglesia-tabs .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#tj-iglesia-tabs .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      iglesiaSel = tab.dataset.value;
    });
  });

  let estadoSel = tema?.estado || "pendiente";
  document.querySelectorAll("#tj-estado-tabs .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#tj-estado-tabs .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      estadoSel = tab.dataset.value;
    });
  });

  document.getElementById("tj-guardar").addEventListener("click", async () => {
    const titulo = document.getElementById("tj-titulo").value.trim();
    if (!titulo) {
      mostrarToast("Escribe el título del tema.");
      return;
    }
    if (!iglesiaSel) {
      mostrarToast("Selecciona la iglesia del tema.");
      return;
    }
    const fechaVal = document.getElementById("tj-fecha-limite").value;
    let fechaLimite = null;
    if (fechaVal) {
      const [y, m, d] = fechaVal.split("-").map(Number);
      fechaLimite = new Date(y, m - 1, d);
    }
    const responsable = document.getElementById("tj-responsable").value.trim();
    const notas = document.getElementById("tj-notas").value.trim();

    if (tema) {
      await actualizarTema(tema.id, {
        titulo,
        iglesia: iglesiaSel,
        estado: estadoSel,
        responsable,
        notas,
        fechaLimite: fechaLimite ? Timestamp.fromDate(fechaLimite) : null,
      });
    } else {
      await crearTema({ titulo, iglesia: iglesiaSel, estado: estadoSel, responsable, notas, fechaLimite });
    }
    mostrarToast(tema ? "Tema actualizado." : "Tema agregado.");
    cerrarModal();
  });

  document.getElementById("tj-eliminar")?.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar el tema "${tema.titulo}"?`)) return;
    await eliminarTema(tema.id);
    mostrarToast("Tema eliminado.");
    cerrarModal();
  });

  document.getElementById("modal-backdrop").classList.add("open");
}
