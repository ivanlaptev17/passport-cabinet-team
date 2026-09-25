import { useEffect, useState } from "react";
import { createCategory, errorText, fetchCategories, type TaskCategory } from "../api/tasks";

type Props = {
  organizationId: number;
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

/** Категории организации: выбрать из имеющихся или завести новую прямо здесь. */
export default function TagPicker({ organizationId, selected, onChange, disabled = false }: Props) {
  const [tags, setTags] = useState<TaskCategory[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCategories(organizationId)
      .then((list) => alive && setTags(list))
      .catch(() => alive && setError("Не удалось загрузить категории"));
    return () => {
      alive = false;
    };
  }, [organizationId]);

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const add = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    setError("");
    try {
      // такая категория уже есть — бэкенд вернёт существующую, а не создаст дубль
      const tag = await createCategory(organizationId, name);
      setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name, "ru"))));
      if (!selected.includes(tag.id)) onChange([...selected, tag.id]);
      setDraft("");
    } catch (e) {
      setError(errorText(e, "Не удалось создать категорию"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 mb-2">
        {tags.length === 0 && <span className="text-muted" style={{ fontSize: 13 }}>Категорий пока нет — создайте первую</span>}
        {tags.map((tag) => {
          const active = selected.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              className="btn btn-sm rounded-pill"
              style={{
                border: `1px solid ${tag.color}`,
                background: active ? tag.color : "transparent",
                color: active ? "white" : tag.color,
                fontSize: 12,
                padding: "2px 10px",
              }}
              onClick={() => toggle(tag.id)}
            >
              {active && <i className="fa fa-check me-1" />}
              {tag.name}
            </button>
          );
        })}
      </div>

      {!disabled && (
        <div className="input-group input-group-sm" style={{ maxWidth: 320 }}>
          <input
            className="form-control"
            placeholder="Новая категория"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <button type="button" className="btn btn-outline-secondary" disabled={busy || !draft.trim()} onClick={() => void add()}>
            <i className="fa fa-plus" />
          </button>
        </div>
      )}

      {error && <div className="text-danger mt-1" style={{ fontSize: 12 }}>{error}</div>}
    </div>
  );
}

/** Чипы категорий только для чтения — карточка задачи, экран задачи. */
export function TagChips({ tags }: { tags: TaskCategory[] }) {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="badge rounded-pill"
          style={{ background: `${tag.color}1f`, color: tag.color, border: `1px solid ${tag.color}55`, fontWeight: 500 }}
        >
          {tag.name}
        </span>
      ))}
    </>
  );
}
