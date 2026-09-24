import { useEffect, useState } from "react";
import { fetchTaskContext, type TaskContext } from "../api/tasks";

// Контекст нужен почти на каждой странице (шапка, журнал, задача) — держим
// один запрос на короткое время, а не дёргаем бэкенд при каждом переходе
const TTL_MS = 60_000;
let cached: { at: number; promise: Promise<TaskContext> } | null = null;

export function loadTaskContext(force = false): Promise<TaskContext> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = fetchTaskContext();
  cached = { at: Date.now(), promise };
  // неудачный запрос не кэшируем, иначе ошибка залипла бы на минуту
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

/** Сбросить после изменения ролей — права пересчитаются при следующем запросе. */
export function invalidateTaskContext() {
  cached = null;
}

export function useTaskContext(): TaskContext | null {
  const [context, setContext] = useState<TaskContext | null>(null);
  useEffect(() => {
    let alive = true;
    loadTaskContext()
      .then((ctx) => alive && setContext(ctx))
      .catch(() => alive && setContext(null));
    return () => {
      alive = false;
    };
  }, []);
  return context;
}
