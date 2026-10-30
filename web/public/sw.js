// Service worker for Web Push. It only shows notifications; it does not cache anything.
// The Worker sends a JSON payload { title, body } (src/integrations/webpush.ts).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: show the generic notification below.
  }
  const title = typeof data.title === "string" ? data.title : "Watten";
  const body = typeof data.body === "string" ? data.body : "";
  event.waitUntil(self.registration.showNotification(title, { body, lang: "sv" }));
});

// Clicking a notification focuses an open Watten tab, or opens one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : self.clients.openWindow("/");
    }),
  );
});
