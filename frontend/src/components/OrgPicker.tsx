import { useEffect, useState } from "react";
import { errorText } from "../api/tasks";
import {
  fetchMunicipalities,
  searchOrganizations,
  type DirectoryOrg,
  type Municipality,
} from "../api/org";
import { setActiveOrg, useActiveOrg } from "../utils/activeOrg";

type Props = { onClose: () => void };

/**
 * Выбор организации: сначала регион, потом поиск по названию.
 * Школ «№ 1» в области десятки, поэтому без региона искать неудобно.
 */
export default function OrgPicker({ onClose }: Props) {
  const active = useActiveOrg();
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [municipalityId, setMunicipalityId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryOrg[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchMunicipalities()
      .then((list) => alive && setMunicipalities(list))
      .catch((e) => alive && setError(errorText(e, "Не удалось загрузить регионы")));
    return () => {
      alive = false;
    };
  }, []);

  // Поиск с небольшой задержкой — чтобы не дёргать сервер на каждую букву
  const requestKey = `${municipalityId ?? ""}|${query.trim()}`;
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      searchOrganizations(municipalityId, query.trim())
        .then((list) => alive && setResults(list))
        .catch((e) => alive && setError(errorText(e, "Не удалось найти организации")))
        .finally(() => alive && setLoadedFor(requestKey));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [municipalityId, query, requestKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loading = loadedFor !== requestKey;

  const choose = (org: DirectoryOrg) => {
    setActiveOrg({ id: org.id, name: org.name, municipalities: org.municipalities });
    onClose();
  };

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content rounded-4 border-0">
          <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
            <h6 className="modal-title mb-0 fw-semibold">
              <i className="fa fa-school me-2" />
              Выбор организации
            </h6>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>

          <div className="modal-body">
            <label className="form-label small fw-semibold">Регион</label>
            <select
              className="form-select mb-3"
              value={municipalityId ?? ""}
              onChange={(e) => setMunicipalityId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Все регионы</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.organizations})
                </option>
              ))}
            </select>

            <label className="form-label small fw-semibold">Организация</label>
            <input
              className="form-control mb-3"
              placeholder="Начните вводить название"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />

            {error && <div className="alert alert-danger py-2">{error}</div>}

            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border spinner-border-sm text-secondary" />
              </div>
            ) : results.length === 0 ? (
              <div className="text-muted text-center py-4" style={{ fontSize: 14 }}>
                Ничего не найдено
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {results.map((org) => {
                  const selected = org.id === active?.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      className={`btn text-start rounded-3 d-flex align-items-center gap-3 px-3 py-2 ${
                        selected ? "btn-secondary" : "btn-outline-secondary"
                      }`}
                      onClick={() => choose(org)}
                    >
                      <i className="fa fa-school" />
                      <span className="flex-grow-1">
                        <span className="d-block fw-semibold" style={{ fontSize: 14 }}>{org.name}</span>
                        {org.municipalities.length > 0 && (
                          <span className="d-block" style={{ fontSize: 12, opacity: 0.75 }}>
                            {org.municipalities.join(", ")}
                          </span>
                        )}
                      </span>
                      {selected && <i className="fa fa-check" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
