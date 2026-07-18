/* Service worker de Firebase Cloud Messaging.
   IMPORTANTE: esta configuración debe ser IDÉNTICA a la de js/firebase-config.js
   (los service workers no pueden importar módulos ES fácilmente, así que se duplica aquí). */
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA8JwOyOgw78eC3PQ3kMAXK-njGcOUsAKY",
  authDomain: "visitas-pastorales-65a3b.firebaseapp.com",
  projectId: "visitas-pastorales-65a3b",
  storageBucket: "visitas-pastorales-65a3b.firebasestorage.app",
  messagingSenderId: "359148626098",
  appId: "1:359148626098:web:16d5de0d07b589a671e9ab",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const titulo = payload.notification?.title || "Pastor360";
  const cuerpo = payload.notification?.body || "";
  self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: "assets/icons/icon-192.png",
    badge: "assets/icons/icon-192.png",
  });
});
