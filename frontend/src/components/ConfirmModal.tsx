type Props = {
  title?: string;
  text: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  title = "Вы уверены?",
  text,
  confirmLabel = "Подтвердить",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onCancel}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content rounded-4 border-0">
          <div className="modal-body text-center py-4">
            <div
              className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
              style={{
                width: 52,
                height: 52,
                background: danger ? "#fdecea" : "#e8f0fe",
                color: danger ? "#dc3545" : "#0d6efd",
              }}
            >
              <i className={`fa ${danger ? "fa-triangle-exclamation" : "fa-circle-question"}`} style={{ fontSize: 20 }} />
            </div>
            <h6 className="fw-semibold mb-2">{title}</h6>
            <div className="text-muted" style={{ fontSize: 14 }}>
              {text}
            </div>
          </div>
          <div className="modal-footer border-0 pt-0 justify-content-center gap-2">
            <button className="btn btn-outline-secondary px-4" onClick={onCancel} disabled={busy}>
              Отмена
            </button>
            <button
              className={`btn px-4 text-white ${danger ? "btn-danger" : "btn-primary"}`}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy && <span className="spinner-border spinner-border-sm me-1" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
