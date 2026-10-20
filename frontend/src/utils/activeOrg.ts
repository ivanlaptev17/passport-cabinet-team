import { useSyncExternalStore } from "react";

/**
 * Выбранная организация — «в момент времени смотрим на одну организацию».
 *
 * Хранится в localStorage и уходит на бэкенд с каждым запросом заголовком
 * X-Organization-Id: по нему бэкенд фильтрует все разделы с данными школы.
 * Министерство выбирает организацию само, сотруднику подставляется его школа.
 */

export type ActiveOrg = {
  id: number;
  name: string;
  municipalities?: string[];
};

const KEY = "activeOrg";
const listeners = new Set<() => void>();

function read(): ActiveOrg | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (parsed && Number.isInteger(parsed.id) && parsed.id > 0 && typeof parsed.name === "string") {
      return parsed as ActiveOrg;
    }
  } catch {
    // localStorage недоступен или испорчен — считаем, что ничего не выбрано
  }
  return null;
}

let current: ActiveOrg | null = read();

export function getActiveOrg(): ActiveOrg | null {
  return current;
}

export function setActiveOrg(org: ActiveOrg | null) {
  const same =
    current?.id === org?.id &&
    current?.name === org?.name &&
    (current?.municipalities ?? []).join() === (org?.municipalities ?? []).join();
  if (same) return;
  current = org;
  try {
    if (org) localStorage.setItem(KEY, JSON.stringify(org));
    else localStorage.removeItem(KEY);
  } catch {
    // не сохранилось между сессиями — в текущей всё равно работает
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveOrg(): ActiveOrg | null {
  return useSyncExternalStore(subscribe, getActiveOrg);
}

/** Заголовок для fetch. */
export function orgHeaders(): Record<string, string> {
  return current ? { "X-Organization-Id": String(current.id) } : {};
}

/** Для EventSource: заголовки он передавать не умеет, поэтому параметром. */
export function withOrgParam(url: string): string {
  if (!current) return url;
  return `${url}${url.includes("?") ? "&" : "?"}org=${current.id}`;
}
