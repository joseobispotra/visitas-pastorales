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
import { cerrarModal } from "./modal.js";
import { mostrarToast } from "./toast.js";
import { escapeHtml } from "./util.js";

export const PRIORIDADES = [
  { valor: "alta", etiqueta: "Alta" },
  { valor: "media", etiqueta: "Media" },
  { valor: "baja", etiqueta: "Baja" },
];

const col = collection(db, "tareas");
let tareasCache = [];

function mapDoc(d) {
  return { id: d.id, ...d.data() };
}

export function listenTareas(callback) {
  const q = query(col, orderBy("creadoEn", "desc"));
  return onSnapshot(q, (snap) => {
    tareasCache = snap.docs.map(mapDoc);
    callback(tareasCache);
  });
}

/** Tareas no marcadas como hechas, para el resumen de "Hoy". */
export function listenTareasPendientes(callback) {
  return listenTareas((tareas) => callback(tareas.filter((t) => t.estado !== "hecha")));
}

export async function crearTarea(datos) {
  return addDoc(col, {
    titulo: datos.titulo,
    subtareas: datos.subtareas || [],
    prioridad: datos.prioridad || "media",
    estado: "pendiente",
    fechaLimite: datos.fechaLimite ? Timestamp.fromDate(datos.fechaLimite) : null,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

export async function actualizarTarea(id, datos) {
  return updateDoc(doc(db, "tareas", id), { ...datos, actualizadoEn: serverTimestamp() });
}

export async function eliminarTarea(id) {
  return deleteDoc(doc(db, "tareas", id));
}

export async function toggleSubtarea(tarea, index) {
  const subtareas = tarea.subtareas.map((s, i) => (i === index ? { ...s, hecho: !s.hecho } : s));
  await actualizarTarea(tarea.id, { subtareas });
}

export async function toggleEstadoTarea(tarea) {
  await actualizarTarea(tarea.id, { estado: tarea.estado === "hecha" ? "pendiente" : "hecha" });
}

function formatearFechaLimite(fecha) {
  if (!fecha) return "";
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  return d.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
}

function etiquetaPrioridad(p) {
  return PRIORIDADES.find((x) => x.valor === p)?.etiqueta || "Media";
}

function toDateInputValue(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function initTareas() {
  const listaEl = document.getElementById("lista-tareas");
  document.getElementById("btn-nueva-tarea").addEventListener("click", () => abrirFormularioTarea());

  listenTareas((tareas) => {
    listaEl.innerHTML =
      tareas.length === 0
        ? `<div class="empty-state"><div class="glyph">✅</div>Aún no has agregado tareas. Comienza con "Nueva tarea".</div>`
        : tareas.map(itemHtml).join("");
  });

  listaEl.addEventListener("click", (e) => {
    const li = e.target.closest(".visit-item");
    if (!li) return;
    const tarea = tareasCache.find((t) => t.id === li.dataset.id);
    if (!tarea) return;

    const chk = e.target.closest("[data-subindex]");
    if (chk) {
      toggleSubtarea(tarea, Number(chk.dataset.subindex));
      return;
    }
    if (e.target.closest('[data-action="estado"]')) {
      toggleEstadoTarea(tarea);
      return;
    }
    abrirFormularioTarea(tarea);
  });
}

function itemHtml(t) {
  const vencimiento = formatearFechaLimite(t.fechaLimite);
  const subtareas = t.subtareas || [];
  const hechas = subtareas.filter((s) => s.hecho).length;
  return `
    <li class="visit-item" data-id="${t.id}" style="align-items:flex-start;${t.estado === "hecha" ? "opacity:.6;" : ""}">
      <div class="info" style="flex:1 1 220px;">
        <div class="name"${t.estado === "hecha" ? ' style="text-decoration:line-through;"' : ""}>${escapeHtml(t.titulo)}</div>
        <div class="meta">
          <span class="badge badge-prioridad-${t.prioridad}">${etiquetaPrioridad(t.prioridad)}</span>
          ${vencimiento ? " · Límite: " + vencimiento : ""}
          ${subtareas.length ? ` · ${hechas}/${subtareas.length} subtareas` : ""}
        </div>
        ${
          subtareas.length
            ? `<ul class="checklist">
                ${subtareas
                  .map(
                    (s, i) => `
                  <li class="checklist-item${s.hecho ? " done" : ""}">
                    <input type="checkbox" data-subindex="${i}" ${s.hecho ? "checked" : ""}>
                    <span class="texto">${escapeHtml(s.texto)}</span>
                  </li>`
                  )
                  .join("")}
              </ul>`
            : ""
        }
      </div>
      <button class="icon-btn" data-action="estado" title="${t.estado === "hecha" ? "Marcar pendiente" : "Marcar tarea como hecha"}">${t.estado === "hecha" ? "↺" : "✓"}</button>
    </li>
  `;
}

function abrirFormularioTarea(tarea = null) {
  document.getElementById("modal-titulo").textContent = tarea ? "Editar tarea" : "Nueva tarea";
  const subtareasTexto = (tarea?.subtareas || []).map((s) => s.texto).join("\n");
  document.getElementById("modal-body").innerHTML = `
    <div class="form-grid">
      <div class="form-field full">
        <label>Título</label>
        <input type="text" id="t-titulo" value="${escapeHtml(tarea?.titulo || "")}">
      </div>
      <div class="form-field full">
        <label>Prioridad</label>
        <div class="church-tabs" id="t-prioridad-tabs">
          ${PRIORIDADES.map(
            (p) => `<div class="church-tab${(tarea?.prioridad || "media") === p.valor ? " active" : ""}" data-value="${p.valor}">${p.etiqueta}</div>`
          ).join("")}
        </div>
      </div>
      <div class="form-field full">
        <label>Fecha límite (opcional)</label>
        <input type="date" id="t-fecha-limite" value="${tarea?.fechaLimite ? toDateInputValue(tarea.fechaLimite) : ""}">
      </div>
      <div class="form-field full">
        <label>Subtareas (una por línea)</label>
        <textarea id="t-subtareas" placeholder="Ej.&#10;Confirmar predicador invitado&#10;Reservar el salón">${escapeHtml(subtareasTexto)}</textarea>
      </div>
    </div>
    <div class="form-actions" style="justify-content:space-between;">
      ${tarea ? `<button type="button" class="btn btn-outline" id="t-eliminar">Eliminar</button>` : "<span></span>"}
      <button type="button" class="btn btn-solid" id="t-guardar">${tarea ? "Guardar cambios" : "Agregar tarea"}</button>
    </div>
  `;

  let prioridadSel = tarea?.prioridad || "media";
  document.querySelectorAll("#t-prioridad-tabs .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#t-prioridad-tabs .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      prioridadSel = tab.dataset.value;
    });
  });

  document.getElementById("t-guardar").addEventListener("click", async () => {
    const titulo = document.getElementById("t-titulo").value.trim();
    if (!titulo) {
      mostrarToast("Escribe el título de la tarea.");
      return;
    }

    const lineas = document
      .getElementById("t-subtareas")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const previas = tarea?.subtareas || [];
    const subtareas = lineas.map((texto) => {
      const existente = previas.find((s) => s.texto === texto);
      return { texto, hecho: existente ? existente.hecho : false };
    });

    const fechaVal = document.getElementById("t-fecha-limite").value;
    let fechaLimite = null;
    if (fechaVal) {
      const [y, m, d] = fechaVal.split("-").map(Number);
      fechaLimite = new Date(y, m - 1, d);
    }

    if (tarea) {
      await actualizarTarea(tarea.id, {
        titulo,
        subtareas,
        prioridad: prioridadSel,
        fechaLimite: fechaLimite ? Timestamp.fromDate(fechaLimite) : null,
      });
    } else {
      await crearTarea({ titulo, subtareas, prioridad: prioridadSel, fechaLimite });
    }
    mostrarToast(tarea ? "Tarea actualizada." : "Tarea agregada.");
    cerrarModal();
  });

  document.getElementById("t-eliminar")?.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar la tarea "${tarea.titulo}"?`)) return;
    await eliminarTarea(tarea.id);
    mostrarToast("Tarea eliminada.");
    cerrarModal();
  });

  document.getElementById("modal-backdrop").classList.add("open");
}
