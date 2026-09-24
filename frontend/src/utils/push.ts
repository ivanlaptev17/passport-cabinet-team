import { fetchPushPublicKey, removePushSubscription, savePushSubscription } from "../api/tasks";

/**
 * Системные уведомления (web push).
 *
 * Разрешение браузер спрашивает только по действию пользователя — Safari
 * по-другому вообще не умеет, — поэтому включение висит на кнопке.
 */

export type PushState =
  | "unsupported" // браузер не умеет
  | "needs-install" // iPhone/iPad: push работает только у сайта, добавленного на экран «Домой»
  | "denied" // пользователь запретил — вернуть можно только в настройках браузера
  | "off" // можно включить
  | "on"; // включено на этом устройстве

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = base64UrlToBytes(publicKey);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // нет https или воркер недоступен — приложение работает и без него
  }
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

async function subscribe(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const { public_key } = await fetchPushPublicKey();

  let subscription = await registration.pushManager.getSubscription();
  // Ключ на сервере сменился — старая подписка им не подписана, её не примут
  if (subscription && !sameKey(subscription, public_key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(public_key),
    });
  }
  await savePushSubscription(subscription.toJSON());
}

export async function enablePush(): Promise<PushState> {
  if (!supported()) return getPushState();
  await registerServiceWorker();
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  await subscribe();
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await removePushSubscription(subscription.endpoint).catch(() => null);
    await subscription.unsubscribe();
  }
  return "off";
}

/**
 * При каждом входе пересылаем подписку на сервер: в этом браузере мог зайти
 * другой пользователь, а на сервере могла пересоздаться база. Разрешение уже
 * дано, поэтому никаких окон пользователь не увидит.
 */
let synced = false;
let syncing: Promise<void> | null = null;

export async function syncPushSubscription(): Promise<void> {
  // колокольчик в шапке монтируется на каждой странице — после удачной синхронизации
  // больше не повторяем, а неудачную повторим при следующем переходе
  if (synced || !supported() || Notification.permission !== "granted") return;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      await registerServiceWorker();
      await subscribe();
      synced = true;
    } catch {
      // не вышло — попробуем на следующей странице
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
