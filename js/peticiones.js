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
import { mostrarToast } from "./toast.js";
import { escapeHtml } from "./util.js";

const col = collection(db, "peticiones");
let peticionesCache = [];

function mapDoc(d) {
  return { id: d.id, ...d.data() };
}

export function listenPeticiones(callback) {
  const q = query(col, orderBy("creadoEn", "desc"));
  return onSnapshot(q, (snap) => {
    peticionesCache = snap.docs.map(mapDoc);
    callback(peticionesCache);
  });
}

export async function crearPeticion(datos) {
  return addDoc(col, {
    texto: datos.texto || "",
    deQuien: datos.deQuien || "",
    estado: "activa",
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

export async function alternarEstadoPeticion(peticion) {
  const nuevoEstado = peticion.estado === "respondida" ? "activa" : "respondida";
  return updateDoc(doc(db, "peticiones", peticion.id), {
    estado: nuevoEstado,
    actualizadoEn: serverTimestamp(),
  });
}

export async function eliminarPeticion(id) {
  return deleteDoc(doc(db, "peticiones", id));
}

export function initPeticiones() {
  const listaEl = document.getElementById("lista-oracion");
  const form = document.getElementById("form-peticion");

  listenPeticiones((peticiones) => {
    listaEl.innerHTML =
      peticiones.length === 0
        ? `<div class="empty-state"><div class="glyph">🙏</div>Aún no tienes peticiones registradas.</div>`
        : peticiones.map(itemHtml).join("");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textoEl = document.getElementById("peticion-texto");
    const deQuienEl = document.getElementById("peticion-de-quien");
    const texto = textoEl.value.trim();
    if (!texto) return;
    await crearPeticion({ texto, deQuien: deQuienEl.value.trim() });
    textoEl.value = "";
    deQuienEl.value = "";
    mostrarToast("Petición agregada.");
  });

  listaEl.addEventListener("click", async (e) => {
    const li = e.target.closest("[data-id]");
    const btn = e.target.closest("[data-action]");
    if (!li || !btn) return;
    const peticion = peticionesCache.find((p) => p.id === li.dataset.id);
    if (!peticion) return;

    if (btn.dataset.action === "toggle") {
      await alternarEstadoPeticion(peticion);
    } else if (btn.dataset.action === "eliminar") {
      if (confirm("¿Eliminar esta petición?")) await eliminarPeticion(peticion.id);
    }
  });
}

function itemHtml(p) {
  const respondida = p.estado === "respondida";
  return `
    <li class="visit-item" data-id="${p.id}" style="${respondida ? "opacity:.6;" : ""}">
      <div class="info">
        <div class="name" style="${respondida ? "text-decoration:line-through;" : ""}">${escapeHtml(p.texto)}</div>
        <div class="meta">${p.deQuien ? escapeHtml(p.deQuien) : "Sin nombre"}</div>
      </div>
      <span class="badge badge-${respondida ? "completada" : "pendiente"}">${respondida ? "Respondida" : "Activa"}</span>
      <div class="actions">
        <button class="icon-btn" data-action="toggle" title="${respondida ? "Reabrir" : "Marcar respondida"}">${respondida ? "↺" : "✓"}</button>
        <button class="icon-btn" data-action="eliminar" title="Eliminar">🗑</button>
      </div>
    </li>
  `;
}
