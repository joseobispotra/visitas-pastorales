# Pastor360 — José Obispo

App web de administración pastoral para las iglesias **Molinuevo**, **Luz de Ozama** y **Effatá**: visitas, directorio de miembros, peticiones de oración, calendario de actividades, temas de junta y tareas. Funciona desde el teléfono o la PC, sincroniza los datos en la nube (Firebase) y puede instalarse como app (PWA).

Es un sitio 100% estático (HTML/CSS/JS, sin paso de compilación), así que se puede desplegar tal cual en Vercel.

## 1. Crear el proyecto de Firebase (gratis)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) e inicia sesión con tu cuenta de Google.
2. **Agregar proyecto** → nómbralo, por ejemplo, `pastor360` → puedes desactivar Google Analytics (no hace falta).
3. Dentro del proyecto, click en el ícono **Web `</>`** para registrar una app web. Ponle un apodo (ej. "Pastor360 Web") y **no** marques Firebase Hosting.
4. Copia el objeto `firebaseConfig` que te muestra (apiKey, authDomain, projectId, etc.).

### Activar Authentication
- Menú **Build > Authentication** → pestaña **Sign-in method** → habilita **Correo electrónico/contraseña**.
- Pestaña **Users** → **Add user** → crea tu único usuario (tu correo y una contraseña).

### Activar Firestore (la base de datos)
- Menú **Build > Firestore Database** → **Crear base de datos** → modo **producción** → elige la región más cercana (ej. `us-east1` o `southamerica-east1`).
- Ve a la pestaña **Reglas** y reemplaza el contenido por esto (solo tu usuario autenticado puede leer/escribir):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

- **Publicar**.

### Activar Cloud Messaging (notificaciones push reales)
- Menú **Build > Cloud Messaging** → pestaña **Web Push certificates** (Certificados push web) → **Generar par de claves**. Copia la clave (VAPID key).

## 2. Pegar tus claves en el proyecto

Edita estos dos archivos y reemplaza los valores `TU_...` con los datos que copiaste en el paso 1 (deben quedar **idénticos** en ambos archivos):

- [`js/firebase-config.js`](js/firebase-config.js) — además pega aquí la `VAPID_KEY`.
- [`firebase-messaging-sw.js`](firebase-messaging-sw.js)

## 3. Probar localmente

Desde esta carpeta, levanta un servidor simple (necesario porque los Service Workers no funcionan abriendo el archivo directamente con doble clic):

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080` en el navegador, inicia sesión con el usuario que creaste en Firebase Authentication, y prueba:
- Agendar una visita para hoy en cada una de las 3 iglesias.
- Verificar que aparecen en "Hoy debes visitar".
- Marcar una como completada y confirmar que sugiere la próxima visita.
- Revisar la vista mensual (lista + gráfico de pastel).
- Activar notificaciones y confirmar que aparece un aviso del sistema.

## 4. Subir a GitHub

```bash
cd visitas-pastorales
git init
git add .
git commit -m "Pastor360 - versión inicial"
```

Crea un repositorio vacío en [github.com/new](https://github.com/new) (sin README, sin .gitignore) y luego:

```bash
git remote add origin https://github.com/TU_USUARIO/visitas-pastorales.git
git branch -M main
git push -u origin main
```

## 5. Desplegar en Vercel

1. Entra a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. **Add New… > Project** → selecciona el repositorio `visitas-pastorales`.
3. Vercel detecta que es un sitio estático — no necesitas cambiar ninguna configuración. Click **Deploy**.
4. En unos segundos tendrás tu URL pública (ej. `visitas-pastorales.vercel.app`), accesible desde el teléfono y la PC.

### Instalarla como app en el teléfono
- **Android (Chrome)**: menú ⋮ → "Añadir a pantalla de inicio".
- **iPhone (Safari)**: botón compartir → "Añadir a pantalla de inicio". *(Las notificaciones push en iPhone solo funcionan si la app fue añadida a la pantalla de inicio de esta forma, y requieren iOS 16.4 o superior).*

## Cómo funcionan las notificaciones push

Cuando abres la app y tienes visitas agendadas para hoy, se activa automáticamente una notificación real del sistema (una vez al día) con los nombres de a quién visitarás. Esto no requiere nada adicional de tu parte, solo aceptar el permiso de notificaciones la primera vez que la app te lo pida.

**Nota sobre notificaciones a una hora fija con la app cerrada:** lo implementado dispara la notificación en cuanto abres la app (funciona perfecto para revisar tu agenda en la mañana). Si en el futuro quieres que la notificación llegue sola a una hora exacta aunque no hayas abierto la app, eso requiere una función programada en el servidor (Firebase Cloud Function + Cloud Scheduler), lo cual exige activar el plan "Blaze" de Firebase (sigue siendo gratis para este volumen de uso, pero pide una tarjeta registrada) y tener Node.js instalado para desplegarla. Si más adelante quieres esa mejora, avísame y la construimos aparte.

## Estructura del proyecto

```
index.html                 Pantalla de login
app.html                   Aplicación (Hoy / Agendar / Miembros / Oración / Mensual / Gestión)
manifest.json              Configuración de PWA
firebase-messaging-sw.js   Service worker de notificaciones push
css/styles.css             Estilos
js/firebase-config.js      Claves de Firebase (edítalo, ver paso 2)
js/auth.js                 Login / logout / sesión
js/visitas.js              Lectura y escritura de visitas en Firestore
js/dashboard.js            Vista "Hoy"
js/mensual.js              Vista mensual (lista + gráfico de pastel)
js/modal.js                Ventana de detalle/edición de una visita
js/notificaciones.js       Notificaciones push
js/calendario.js           Calendario de actividades (Gestión)
js/junta.js                Temas de junta (Gestión)
js/tareas.js               Tareas y subtareas (Gestión)
js/app-shell.js            Navegación y formulario de "Agendar"
js/util.js                 Funciones de formato compartidas
assets/                    Ilustración de fondo e íconos
```
