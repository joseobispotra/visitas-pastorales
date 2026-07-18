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
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { IGLESIAS, colorClaseIglesia } from "./visitas.js";
import { cerrarModal } from "./modal.js";
import { mostrarToast } from "./toast.js";
import { escapeHtml } from "./util.js";

const col = collection(db, "miembros");
let miembrosCache = [];

function mapDoc(d) {
  return { id: d.id, ...d.data() };
}

export function listenMiembros(callback) {
  const q = query(col, orderBy("nombre", "asc"));
  return onSnapshot(q, (snap) => {
    miembrosCache = snap.docs.map(mapDoc);
    callback(miembrosCache);
  });
}

export function obtenerMiembrosCache() {
  return miembrosCache;
}

export async function crearMiembro(datos) {
  return addDoc(col, {
    nombre: datos.nombre || "",
    telefono: datos.telefono || "",
    direccion: datos.direccion || "",
    iglesia: datos.iglesia || "",
    notas: datos.notas || "",
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

export async function actualizarMiembro(id, datos) {
  return updateDoc(doc(db, "miembros", id), { ...datos, actualizadoEn: serverTimestamp() });
}

export async function eliminarMiembro(id) {
  return deleteDoc(doc(db, "miembros", id));
}

export function initMiembros() {
  const listaEl = document.getElementById("lista-miembros");

  document.getElementById("btn-nuevo-miembro").addEventListener("click", () => abrirFormularioMiembro());

  listenMiembros((miembros) => {
    listaEl.innerHTML =
      miembros.length === 0
        ? `<div class="empty-state"><div class="glyph">👤</div>Aún no has agregado miembros. Comienza con "Nuevo miembro".</div>`
        : miembros.map(itemHtml).join("");

    const datalist = document.getElementById("miembros-datalist");
    if (datalist) {
      datalist.innerHTML = miembros
        .map((m) => `<option value="${escapeHtml(m.nombre)} — ${escapeHtml(m.iglesia)}"></option>`)
        .join("");
    }
  });

  listaEl.addEventListener("click", (e) => {
    const li = e.target.closest(".visit-item");
    if (!li) return;
    const miembro = miembrosCache.find((m) => m.id === li.dataset.id);
    if (miembro) abrirFormularioMiembro(miembro);
  });
}

function itemHtml(m) {
  return `
    <li class="visit-item" data-id="${m.id}">
      <span class="church-dot ${colorClaseIglesia(m.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(m.nombre)}</div>
        <div class="meta">${escapeHtml(m.iglesia)}${m.telefono ? " · " + escapeHtml(m.telefono) : ""}</div>
      </div>
      <div class="actions"><button class="icon-btn" data-action="editar">✎</button></div>
    </li>
  `;
}

function abrirFormularioMiembro(miembro = null) {
  document.getElementById("modal-titulo").textContent = miembro ? "Editar miembro" : "Nuevo miembro";
  document.getElementById("modal-body").innerHTML = `
    <div class="form-grid">
      <div class="form-field full">
        <label>Iglesia</label>
        <div class="church-tabs" id="m-iglesia-tabs">
          ${IGLESIAS.map(
            (ig) => `<div class="church-tab${miembro?.iglesia === ig ? " active" : ""}" data-value="${ig}">${ig}</div>`
          ).join("")}
        </div>
      </div>
      <div class="form-field full">
        <label>Nombre completo</label>
        <input type="text" id="mm-nombre" value="${escapeHtml(miembro?.nombre || "")}">
      </div>
      <div class="form-field">
        <label>Teléfono</label>
        <input type="tel" id="mm-telefono" value="${escapeHtml(miembro?.telefono || "")}">
      </div>
      <div class="form-field">
        <label>Dirección</label>
        <input type="text" id="mm-direccion" value="${escapeHtml(miembro?.direccion || "")}">
      </div>
      <div class="form-field full">
        <label>Notas</label>
        <textarea id="mm-notas">${escapeHtml(miembro?.notas || "")}</textarea>
      </div>
    </div>
    <div class="form-actions" style="justify-content:space-between;">
      ${miembro ? `<button type="button" class="btn btn-outline" id="mm-eliminar">Eliminar</button>` : "<span></span>"}
      <button type="button" class="btn btn-solid" id="mm-guardar">${miembro ? "Guardar cambios" : "Agregar miembro"}</button>
    </div>
  `;

  let iglesiaSel = miembro?.iglesia || null;
  document.querySelectorAll("#m-iglesia-tabs .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#m-iglesia-tabs .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      iglesiaSel = tab.dataset.value;
    });
  });

  document.getElementById("mm-guardar").addEventListener("click", async () => {
    const nombre = document.getElementById("mm-nombre").value.trim();
    if (!nombre) {
      mostrarToast("Escribe el nombre del miembro.");
      return;
    }
    if (!iglesiaSel) {
      mostrarToast("Selecciona la iglesia del miembro.");
      return;
    }
    const datos = {
      nombre,
      telefono: document.getElementById("mm-telefono").value.trim(),
      direccion: document.getElementById("mm-direccion").value.trim(),
      iglesia: iglesiaSel,
      notas: document.getElementById("mm-notas").value.trim(),
    };
    if (miembro) await actualizarMiembro(miembro.id, datos);
    else await crearMiembro(datos);
    mostrarToast(miembro ? "Miembro actualizado." : "Miembro agregado al directorio.");
    cerrarModal();
  });

  document.getElementById("mm-eliminar")?.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar a ${miembro.nombre} del directorio?`)) return;
    await eliminarMiembro(miembro.id);
    mostrarToast("Miembro eliminado.");
    cerrarModal();
  });

  document.getElementById("modal-backdrop").classList.add("open");
}
