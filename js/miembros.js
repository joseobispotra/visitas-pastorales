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
import { IGLESIAS, colorClaseIglesia, formatearFecha } from "./visitas.js";
import { cerrarModal } from "./modal.js";
import { mostrarToast } from "./toast.js";
import { escapeHtml, telefonoWhatsApp } from "./util.js";

const col = collection(db, "miembros");
const contactosCol = collection(db, "contactos");
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
 * programa la fecha del próximo contacto para que aparezca en el recordatorio de Hoy.
 * Además guarda un registro histórico en "contactos" para las estadísticas mensuales. */
export async function registrarContacto(id, { tipo, notas, proximoContacto }) {
  const miembro = miembrosCache.find((m) => m.id === id);
  const fecha = Timestamp.fromDate(new Date());

  await addDoc(contactosCol, {
    miembroId: id,
    nombre: miembro?.nombre || "",
    iglesia: miembro?.iglesia || "",
    tipo,
    notas: notas || "",
    fecha,
  });

  return actualizarMiembro(id, {
    ultimoContacto: { tipo, fecha, notas: notas || "" },
    proximoContacto: proximoContacto ? Timestamp.fromDate(proximoContacto) : null,
  });
}

/** Agenda una llamada/mensaje futuro sin registrarlo como ya realizado
 * (a diferencia de registrarContacto, que siempre asume que el contacto ya ocurrió). */
export async function programarProximoContacto(id, { fecha, notas }) {
  return actualizarMiembro(id, {
    proximoContacto: Timestamp.fromDate(fecha),
    notasProximoContacto: notas || "",
  });
}

/** Llamadas/mensajes registrados en un rango de fechas, para la vista mensual. */
export function listenContactosRango(inicio, fin, callback) {
  const q = query(
    contactosCol,
    where("fecha", ">=", Timestamp.fromDate(inicio)),
    where("fecha", "<=", Timestamp.fromDate(fin)),
    orderBy("fecha", "desc")
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map(mapDoc)));
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
    if (btn?.dataset.action === "llamar" || btn?.dataset.action === "whatsapp") return;
    if (btn?.dataset.action === "contacto") {
      abrirFormularioContacto(miembro);
    } else if (btn?.dataset.action === "programar") {
      abrirFormularioProgramar(miembro);
    } else {
      abrirFormularioMiembro(miembro);
    }
  });
}

function itemHtml(m) {
  const ultimoTexto = m.ultimoContacto
    ? `Último contacto: ${diasDesde(m.ultimoContacto.fecha)} (${m.ultimoContacto.tipo === "llamada" ? "llamada" : "mensaje"})`
    : "";
  const proximoTexto = m.proximoContacto ? `Próxima llamada: ${formatearFecha(m.proximoContacto)}` : "";
  const numeroWa = telefonoWhatsApp(m.telefono);
  const numeroTel = (m.telefono || "").replace(/\D/g, "");
  const mensaje = `Hola ${m.nombre || ""}, soy el pastor. Quería saludarte y saber cómo estás. Dios te bendiga.`;
  return `
    <li class="visit-item" data-id="${m.id}">
      <span class="church-dot ${colorClaseIglesia(m.iglesia)}"></span>
      <div class="info">
        <div class="name">${escapeHtml(m.nombre)}</div>
        <div class="meta">${escapeHtml(m.iglesia)}${m.telefono ? " · " + escapeHtml(m.telefono) : ""}</div>
        ${ultimoTexto ? `<div class="meta ultimo-contacto">${ultimoTexto}</div>` : ""}
        ${proximoTexto ? `<div class="meta proximo-contacto">${proximoTexto}</div>` : ""}
      </div>
      <div class="actions">
        ${numeroTel ? `<a class="btn btn-outline btn-llamar" data-action="llamar" href="tel:${numeroTel}">Llamar</a>` : ""}
        ${numeroWa ? `<a class="btn btn-whatsapp" data-action="whatsapp" href="https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        <button class="icon-btn" data-action="programar" title="Programar llamada">🗓️</button>
        <button class="icon-btn" data-action="contacto" title="Registrar contacto">📝</button>
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

function abrirFormularioProgramar(miembro) {
  document.getElementById("modal-titulo").textContent = `Programar llamada — ${miembro.nombre}`;
  document.getElementById("modal-body").innerHTML = `
    <div class="form-grid">
      <div class="form-field full">
        <label>Fecha</label>
        <input type="date" id="p-fecha" value="${miembro.proximoContacto ? toDateInputValue(miembro.proximoContacto) : ""}">
      </div>
      <div class="form-field full">
        <label>Notas (opcional)</label>
        <textarea id="p-notas" placeholder="¿De qué quieres hablarle?">${escapeHtml(miembro.notasProximoContacto || "")}</textarea>
      </div>
    </div>
    <div class="form-actions" style="justify-content:space-between;">
      ${miembro.proximoContacto ? `<button type="button" class="btn btn-outline" id="p-quitar">Quitar programación</button>` : "<span></span>"}
      <button type="button" class="btn btn-solid" id="p-guardar">Guardar</button>
    </div>
  `;

  document.getElementById("p-guardar").addEventListener("click", async () => {
    const fechaVal = document.getElementById("p-fecha").value;
    if (!fechaVal) {
      mostrarToast("Selecciona la fecha de la llamada.");
      return;
    }
    const [y, mo, d] = fechaVal.split("-").map(Number);
    await programarProximoContacto(miembro.id, {
      fecha: new Date(y, mo - 1, d),
      notas: document.getElementById("p-notas").value.trim(),
    });
    mostrarToast("Llamada programada.");
    cerrarModal();
  });

  document.getElementById("p-quitar")?.addEventListener("click", async () => {
    await actualizarMiembro(miembro.id, { proximoContacto: null, notasProximoContacto: "" });
    mostrarToast("Programación eliminada.");
    cerrarModal();
  });

  document.getElementById("modal-backdrop").classList.add("open");
}

function toDateInputValue(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
