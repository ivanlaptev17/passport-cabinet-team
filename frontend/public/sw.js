// Service worker: показывает системные уведомления, даже когда вкладка закрыта.
// Бэкенд шлёт зашифрованное сообщение через push-сервис браузера (Google, Apple,
// Mozilla), браузер будит этот воркер, а он показывает уведомление.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      // Человек прямо сейчас смотрит на приложение — колокольчик уже всё показал,
      // дублировать системным уведомлением незачем
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.focused)) return;

      await self.registration.showNotification(data.title || "Кабинет директора", {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        // одинаковый tag заменяет прежнее уведомление: десять сообщений в чате
        // не превращаются в десять уведомлений
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: data.url || "/tasks" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/tasks", self.location.origin).href;

  event.waitUntil(
    (async () => {
      // Если приложение уже открыто — переводим его на задачу, а не плодим вкладки
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        } catch {
          // вкладка не управляется воркером — пробуем следующую
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
