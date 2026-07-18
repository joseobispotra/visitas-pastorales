import { requerirSesion, cerrarSesion } from "./auth.js";
import { initDashboard } from "./dashboard.js";
import { initMensual } from "./mensual.js";
import { initNotificaciones } from "./notificaciones.js";
import { crearVisita } from "./visitas.js";
import { initMiembros, obtenerOCrearMiembro } from "./miembros.js";
import { initPeticiones } from "./peticiones.js";
import { initCalendario } from "./calendario.js";
import { initJunta } from "./junta.js";
import { initTareas } from "./tareas.js";
import { mostrarToast } from "./toast.js";

const ROUTES = ["hoy", "agendar", "miembros", "oracion", "mensual", "gestion"];
let inicializado = false;

requerirSesion(async () => {
  document.getElementById("loading").style.display = "none";
  document.getElementById("app-shell").style.display = "flex";
  if (inicializado) return;
  inicializado = true;

  initDashboard();
  initMensual();
  initMiembros();
  initPeticiones();
  initCalendario();
  initJunta();
  initTareas();
  initNotificaciones();
  wireRouting();
  wireLogout();
  wireFormAgendar();
  wireGestionSubtabs();
});

function wireRouting() {
  function mostrarRuta() {
    let ruta = location.hash.replace("#/", "") || "hoy";
    if (!ROUTES.includes(ruta)) ruta = "hoy";
    ROUTES.forEach((r) => {
      document.getElementById(`view-${r}`).classList.toggle("active", r === ruta);
    });
    document.querySelectorAll("[data-route]").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === ruta);
    });
  }
  window.addEventListener("hashchange", mostrarRuta);
  if (!location.hash) location.hash = "#/hoy";
  mostrarRuta();
}

function wireLogout() {
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await cerrarSesion();
  });
}

function wireFormAgendar() {
  const form = document.getElementById("form-visita");
  const tabs = document.querySelectorAll("#iglesia-tabs .church-tab");
  const chkSeguimiento = document.getElementById("requiere-seguimiento");
  const fechaSeguimiento = document.getElementById("fecha-seguimiento");
  let iglesiaSeleccionada = null;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      iglesiaSeleccionada = tab.dataset.value;
    });
  });

  chkSeguimiento.addEventListener("change", () => {
    fechaSeguimiento.style.display = chkSeguimiento.checked ? "block" : "none";
    if (!chkSeguimiento.checked) fechaSeguimiento.value = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!iglesiaSeleccionada) {
      mostrarToast("Selecciona la iglesia de la visita.");
      return;
    }
    const fechaVal = document.getElementById("fecha").value;
    const horaVal = document.getElementById("hora").value;
    if (!fechaVal || !horaVal) {
      mostrarToast("Selecciona fecha y hora.");
      return;
    }

    const [y, m, d] = fechaVal.split("-").map(Number);
    const [hh, mm] = horaVal.split(":").map(Number);
    const fecha = new Date(y, m - 1, d, hh, mm);

    let fechaSeguimientoDate = null;
    if (chkSeguimiento.checked && fechaSeguimiento.value) {
      const [sy, sm, sd] = fechaSeguimiento.value.split("-").map(Number);
      fechaSeguimientoDate = new Date(sy, sm - 1, sd);
    }

    const nombre = document.getElementById("nombre").value.trim();
    const telefono = document.getElementById("telefono").value.trim();
    const direccion = document.getElementById("direccion").value.trim();

    const btn = document.getElementById("btn-guardar-visita");
    btn.disabled = true;
    btn.textContent = "Guardando...";

    try {
      const miembroId = await obtenerOCrearMiembro({
        nombre,
        telefono,
        direccion,
        iglesia: iglesiaSeleccionada,
      });

      await crearVisita({
        iglesia: iglesiaSeleccionada,
        fecha,
        nombre,
        telefono,
        direccion,
        motivo: document.getElementById("motivo").value,
        notas: document.getElementById("notas").value.trim(),
        requiereSeguimiento: chkSeguimiento.checked,
        fechaSeguimiento: fechaSeguimientoDate,
        miembroId,
      });

      mostrarToast("Visita agendada. Se actualizó tu directorio de miembros.");
      form.reset();
      tabs.forEach((t) => t.classList.remove("active"));
      iglesiaSeleccionada = null;
      fechaSeguimiento.style.display = "none";
      location.hash = "#/hoy";
    } catch (err) {
      console.error(err);
      mostrarToast("No se pudo guardar la visita. Intenta de nuevo.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Agendar visita";
    }
  });
}

function wireGestionSubtabs() {
  const tabs = document.querySelectorAll("#gestion-subtabs .church-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".gestion-subview").forEach((v) => v.classList.remove("active"));
      document.getElementById(`subview-${tab.dataset.subview}`).classList.add("active");
    });
  });
}
