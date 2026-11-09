import type { FormEvent } from "react";

export type OrgDataFormValue = string | boolean;

export type OrgDataField = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  step?: string;
};

type Props = {
  title: string;
  fields: OrgDataField[];
  values: Record<string, OrgDataFormValue>;
  saving: boolean;
  error?: string;
  onChange: (name: string, value: OrgDataFormValue) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export default function OrgDataEditor({
  title,
  fields,
  values,
  saving,
  error,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-scrollable" onClick={(event) => event.stopPropagation()}>
        <form className="modal-content" onSubmit={submit}>
          <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
            <h6 className="modal-title mb-0 fw-semibold">{title}</h6>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>
          <div className="modal-body">
            {fields.map((field) => (
              <div className={field.type === "checkbox" ? "form-check mb-3" : "mb-3"} key={field.name}>
                {field.type === "checkbox" ? (
                  <>
                    <input
                      id={`org-data-${field.name}`}
                      className="form-check-input"
                      type="checkbox"
                      checked={values[field.name] === true}
                      onChange={(event) => onChange(field.name, event.target.checked)}
                    />
                    <label className="form-check-label small fw-semibold" htmlFor={`org-data-${field.name}`}>
                      {field.label}
                    </label>
                  </>
                ) : (
                  <>
                    <label className="form-label small fw-semibold">{field.label}</label>
                    {field.type === "textarea" ? (
                      <textarea
                        className="form-control"
                        rows={3}
                        required={field.required}
                        placeholder={field.placeholder}
                        value={String(values[field.name] ?? "")}
                        onChange={(event) => onChange(field.name, event.target.value)}
                      />
                    ) : field.type === "select" ? (
                      <select
                        className="form-select"
                        required={field.required}
                        value={String(values[field.name] ?? "")}
                        onChange={(event) => onChange(field.name, event.target.value)}
                      >
                        {!field.required && <option value="">— не указано —</option>}
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="form-control"
                        type={field.type ?? "text"}
                        step={field.step}
                        required={field.required}
                        placeholder={field.placeholder}
                        value={String(values[field.name] ?? "")}
                        onChange={(event) => onChange(field.name, event.target.value)}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
            {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            <button type="submit" className="btn btn-sm text-white" style={{ background: "#37474f" }} disabled={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
