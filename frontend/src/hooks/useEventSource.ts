import { useEffect, useRef } from "react";

type Options = {
  onMessage: (data: string) => void;
  /** Соединение открылось. reconnect = true — после перерыва: пора дотянуть пропущенное */
  onOpen?: (reconnect: boolean) => void;
  onError?: () => void;
};

/**
 * SSE-поток, который живёт, только пока страница видна.
 *
 * Браузер держит не больше 6 соединений на один хост (HTTP/1.1), и каждый поток
 * занимает одно навсегда. Без этого хука хватало пары вкладок — или пары переходов
 * по push-уведомлениям, после которых старые страницы остаются в кэше «назад-вперёд»
 * вместе с потоками, — чтобы все запросы приложения встали в очередь.
 * Поэтому поток закрываем, когда вкладка ушла в фон или страница — в кэш,
 * и открываем заново при возвращении. События за это время доставит web push,
 * а onOpen(true) даёт вызывающему шанс перечитать пропущенное.
 */
export function useEventSource(url: string | null, options: Options) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!url) return;
    let source: EventSource | null = null;
    let openedBefore = false;

    const open = () => {
      if (source || document.visibilityState !== "visible") return;
      const es = new EventSource(url, { withCredentials: true });
      es.onopen = () => {
        optionsRef.current.onOpen?.(openedBefore);
        openedBefore = true;
      };
      es.onmessage = (event) => optionsRef.current.onMessage(event.data as string);
      es.onerror = () => optionsRef.current.onError?.();
      source = es;
    };
    const close = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? open() : close());

    open();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", open);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", open);
      close();
    };
  }, [url]);
}
