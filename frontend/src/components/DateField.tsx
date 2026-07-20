import { useEffect, useRef, useState } from "react";

type Props = {
  value: string; // ISO yyyy-mm-dd или ""
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

function isoToRu(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}.${m}.${y}`;
}

function ruToIso(ru: string): string | null {
  const match = ru.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

/**
 * Поле выбора даты с фиксированным отображением ДД.ММ.ГГГГ.
 *
 * Нативный <input type="date"> показывает дату в формате, зависящем от
 * локали ОС/браузера пользователя (в США — MM/DD/YYYY и т.п.), что вводило
 * в заблуждение. Здесь видимое поле — текстовое с фиксированной маской,
 * а выбор через календарь идёт через скрытый нативный date-input
 * (открывается через showPicker()).
 */
export default function DateField({ value, onChange, className, disabled, placeholder }: Props) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(isoToRu(value));

  useEffect(() => {
    setText(isoToRu(value));
  }, [value]);

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el || disabled) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === "function") {
      try {
        withPicker.showPicker();
        return;
      } catch {
        /* fall through to focus-based fallback */
      }
    }
    el.focus();
  };

  return (
    <div className="input-group">
      <input
        type="text"
        inputMode="numeric"
        className={className ?? "form-control"}
        placeholder={placeholder ?? "ДД.ММ.ГГГГ"}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const iso = ruToIso(e.target.value);
          if (iso) onChange(iso);
        }}
        onBlur={() => setText(isoToRu(value))}
      />
      <button
        type="button"
        className="btn btn-outline-secondary"
        disabled={disabled}
        onClick={openPicker}
        tabIndex={-1}
        title="Выбрать дату в календаре"
      >
        <i className="fa fa-calendar-days" />
      </button>
      <input
        ref={nativeRef}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
