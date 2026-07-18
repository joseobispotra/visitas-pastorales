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

/**
 * Busca un miembro existente por nombre + iglesia (para ir formando el directorio
 * automáticamente con cada visita). Si existe, completa teléfono/dirección que falten
 * y devuelve su id. Si no existe, lo crea.
 */
export async function obtenerOCrearMiembro({ nombre, telefono, direccion, iglesia }) {
  const nombreNormalizado = nombre.trim().toLowerCase();
  const existente = miembrosCache.find(
    (m) => m.nombre.trim().toLowerCase() === nombreNormalizado && m.iglesia === iglesia
  );

  if (existente) {
    const actualizaciones = {};
    if (!existente.telefono && telefono) actualizaciones.telefono = telefono;
    if (!existente.direccion && direccion) actualizaciones.direccion = direccion;
    if (Object.keys(actualizaciones).length > 0) {
      await actualizarMiembro(existente.id, actualizaciones);
    }
    return existente.id;
  }

  const nuevo = await crearMiembro({ nombre, telefono, direccion, iglesia });
  return nuevo.id;
}

/** Registra una llamada o mensaje con un miembro (visitado o no) y, opcionalmente,
 * programa la fecha del próximo contacto para que aparezca en el recordatorio de Hoy. */
export async function registrarContacto(id, { tipo, notas, proximoContacto }) {
  return actualizarMiembro(id, {
    ultimoContacto: {
      tipo,
      fecha: Timestamp.fromDate(new Date()),
      notas: notas || "",
    },
    proximoContacto: proximoContacto ? Timestamp.fromDate(proximoContacto) : null,
  });
}

function diasDesde(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

export function initMiembros() {
  const listaEl = document.getElementById("lista-miembros");

  document.getElementById("btn-nuevo-miembro").addEventListener("click", () => abrirFormularioMiembro());

  listenMiembros((miembros) => {
    listaEl.innerHTML =
      miembros.length === 0
        ? `<div class="empty-state"><div class="glyph">👤</div>Aún no has agregado miembros. Comienza con "Nuevo miembro".</div>`
        : miembros.map(itemHtml).join("");
  });

  listaEl.addEventListener("click", (e) => {
    const li = e.target.closest(".visit-item");
    if (!li) return;
    const miembro = miembrosCache.find((m) => m.id === li.dataset.id);
    if (!miembro) return;

    const btn = e.target.closest("[data-action]");
    if (btn?.dataset.action === "contacto") {
      abrirFormularioContacto(miembro);
    } else {
      abrirFormularioMiembro(miembro);
    }
  });
}

function itemHtml(m) {
  const ultimoTexto = m.ultimoContacto
    ? `Último contacto: ${diasDesde(m.ultimoContacto.fecha)} (${m.ultimoContacto.tipo === "llamada" ? "llamada" : "mensaje"})`
    : "";
  return `
    <li class="visit-item" data-id="${m.id}">
      <span class="church-dot ${colorClaseIglesia(m.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(m.nombre)}</div>
        <div class="meta">${escapeHtml(m.iglesia)}${m.telefono ? " · " + escapeHtml(m.telefono) : ""}</div>
        ${ultimoTexto ? `<div class="meta ultimo-contacto">${ultimoTexto}</div>` : ""}
      </div>
      <div class="actions">
        <button class="icon-btn" data-action="contacto" title="Registrar contacto">📞</button>
        <button class="icon-btn" data-action="editar" title="Editar">✎</button>
      </div>
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

function abrirFormularioContacto(miembro) {
  document.getElementById("modal-titulo").textContent = `Registrar contacto — ${miembro.nombre}`;
  document.getElementById("modal-body").innerHTML = `
    <div class="form-grid">
      <div class="form-field full">
        <label>Tipo de contacto</label>
        <div class="church-tabs" id="c-tipo-tabs">
          <div class="church-tab active" data-value="llamada">📞 Llamada</div>
          <div class="church-tab" data-value="mensaje">💬 Mensaje</div>
        </div>
      </div>
      <div class="form-field full">
        <label>Notas (opcional)</label>
        <textarea id="c-notas" placeholder="¿De qué hablaron?"></textarea>
      </div>
      <div class="form-field full">
        <div class="check-row">
          <input type="checkbox" id="c-programar">
          <label for="c-programar" style="margin:0;font-weight:400;">Programar próximo contacto</label>
        </div>
        <input type="date" id="c-proxima-fecha" style="margin-top:8px;display:none;">
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-solid" id="c-guardar">Guardar contacto</button>
    </div>
  `;

  let tipoSel = "llamada";
  document.querySelectorAll("#c-tipo-tabs .church-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#c-tipo-tabs .church-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      tipoSel = tab.dataset.value;
    });
  });

  const chk = document.getElementById("c-programar");
  const fechaInput = document.getElementById("c-proxima-fecha");
  chk.addEventListener("change", () => {
    fechaInput.style.display = chk.checked ? "block" : "none";
    if (!chk.checked) fechaInput.value = "";
  });

  document.getElementById("c-guardar").addEventListener("click", async () => {
    let proximoContacto = null;
    if (chk.checked && fechaInput.value) {
      const [y, m, d] = fechaInput.value.split("-").map(Number);
      proximoContacto = new Date(y, m - 1, d);
    }
    await registrarContacto(miembro.id, {
      tipo: tipoSel,
      notas: document.getElementById("c-notas").value.trim(),
      proximoContacto,
    });
    mostrarToast("Contacto registrado.");
    cerrarModal();
  });

  document.getElementById("modal-backdrop").classList.add("open");
}
