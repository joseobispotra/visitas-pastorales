import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const IGLESIAS = ["Molinuevo", "Luz de Ozama", "Effatá"];

const col = collection(db, "visitas");

function inicioDelDia(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function finDelDia(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function rangoMes(year, monthIndex) {
  const inicio = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const fin = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

function mapDoc(d) {
  return { id: d.id, ...d.data() };
}

export function listenVisitasRango(inicio, fin, callback) {
  const q = query(
    col,
    where("fecha", ">=", Timestamp.fromDate(inicio)),
    where("fecha", "<=", Timestamp.fromDate(fin)),
    orderBy("fecha", "asc")
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map(mapDoc)));
}

export function listenVisitasHoy(callback) {
  const hoy = new Date();
  return listenVisitasRango(inicioDelDia(hoy), finDelDia(hoy), callback);
}

export async function crearVisita(datos) {
  return addDoc(col, {
    iglesia: datos.iglesia,
    fecha: Timestamp.fromDate(datos.fecha),
    feligres: {
      nombre: datos.nombre || "",
      telefono: datos.telefono || "",
      direccion: datos.direccion || "",
    },
    miembroId: datos.miembroId || null,
    motivo: datos.motivo || "",
    notas: datos.notas || "",
    estado: "pendiente",
    seguimiento: {
      requiere: !!datos.requiereSeguimiento,
      fecha: datos.fechaSeguimiento ? Timestamp.fromDate(datos.fechaSeguimiento) : null,
      notas: "",
    },
    proximaVisitaId: null,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

/** Visitas con seguimiento activo (para el recordatorio diario de WhatsApp). Un solo
 * filtro de igualdad, así que no requiere ningún índice compuesto en Firestore. */
export function listenSeguimientosPendientes(callback) {
  const q = query(col, where("seguimiento.requiere", "==", true));
  return onSnapshot(q, (snap) => callback(snap.docs.map(mapDoc)));
}

export async function actualizarVisita(id, datos) {
  return updateDoc(doc(db, "visitas", id), {
    ...datos,
    actualizadoEn: serverTimestamp(),
  });
}

export async function eliminarVisita(id) {
  return deleteDoc(doc(db, "visitas", id));
}

export async function posponerVisita(id, nuevaFecha) {
  return updateDoc(doc(db, "visitas", id), {
    fecha: Timestamp.fromDate(nuevaFecha),
    estado: "reprogramada",
    actualizadoEn: serverTimestamp(),
  });
}

/**
 * Marca una visita como completada. Si se pasa proximaFecha, crea automáticamente
 * la próxima visita sugerida con los mismos datos del feligrés y enlaza ambos documentos.
 */
export async function marcarCompletada(visita, { notasSeguimiento = "", proximaFecha = null } = {}) {
  let proximaVisitaId = null;

  if (proximaFecha) {
    const nueva = await crearVisita({
      iglesia: visita.iglesia,
      fecha: proximaFecha,
      nombre: visita.feligres?.nombre,
      telefono: visita.feligres?.telefono,
      direccion: visita.feligres?.direccion,
      motivo: visita.motivo,
      notas: `Seguimiento de visita anterior (${formatearFecha(visita.fecha)}).`,
    });
    proximaVisitaId = nueva.id;
  }

  await updateDoc(doc(db, "visitas", visita.id), {
    estado: "completada",
    "seguimiento.notas": notasSeguimiento,
    proximaVisitaId,
    actualizadoEn: serverTimestamp(),
  });

  return proximaVisitaId;
}

export function formatearFecha(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  return d.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
}

export function formatearHora(fecha) {
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
  return d.toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });
}

export function colorClaseIglesia(iglesia) {
  if (iglesia === "Molinuevo") return "dot-molinuevo";
  if (iglesia === "Luz de Ozama") return "dot-luz";
  return "dot-effata";
}
