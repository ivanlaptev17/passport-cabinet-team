import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  createOrgDataRow,
  deleteOrgDataRow,
  updateOrgDataRow,
  type OrgDataResource,
  type OrgDataValues,
} from "../api/data";
import ConfirmModal from "../components/ConfirmModal";
import OrgDataEditor, {
  type OrgDataField,
  type OrgDataFormValue,
} from "../components/OrgDataEditor";

type OrgDataRow = { id: number; organization_id: number };

type Options<T extends OrgDataRow> = {
  resource: OrgDataResource;
  setRows: Dispatch<SetStateAction<T[]>>;
  fields: OrgDataField[];
  defaults: Record<string, OrgDataFormValue>;
  toFormValues: (row: T) => Record<string, OrgDataFormValue>;
  toPayload: (values: Record<string, OrgDataFormValue>) => OrgDataValues;
  itemName: string;
  canWrite: boolean;
  organizationId: number | null;
};

export function useOrgDataCrud<T extends OrgDataRow>({
  resource,
  setRows,
  fields,
  defaults,
  toFormValues,
  toPayload,
  itemName,
  canWrite,
  organizationId,
}: Options<T>) {
  const [target, setTarget] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [error, setError] = useState("");

  const openCreate = () => {
    setTarget(null);
    setCreating(true);
    setValues({ ...defaults });
    setError("");
  };

  const openEdit = (row: T) => {
    setTarget(row);
    setCreating(false);
    setValues(toFormValues(row));
    setError("");
  };

  const closeEditor = () => {
    setTarget(null);
    setCreating(false);
    setError("");
  };

  const save = async () => {
    if ((!target && !creating) || !canWrite) return;
    setBusy(true);
    try {
      const payload = toPayload(values);
      if (creating) {
        if (!organizationId) throw new Error("Сначала выберите организацию");
        const created = await createOrgDataRow<T>(resource, organizationId, payload);
        setRows((current) => [...current, created]);
      } else if (target) {
        const updated = await updateOrgDataRow<T>(resource, target.id, payload);
        setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      }
      closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Не удалось сохранить ${itemName.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteOrgDataRow(resource, deleteTarget.id);
      setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteTarget(null);
      setError(e instanceof Error ? e.message : `Не удалось удалить ${itemName.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const rowActions = (row: T): ReactNode => canWrite ? (
    <>
      <button
        className="btn btn-sm btn-outline-secondary py-0 px-2"
        title="Редактировать"
        onClick={() => openEdit(row)}
      >
        <i className="fa fa-pencil" />
      </button>
      <button
        className="btn btn-sm btn-outline-danger py-0 px-2 ms-1"
        title="Удалить"
        onClick={() => { setError(""); setDeleteTarget(row); }}
      >
        <i className="fa fa-trash" />
      </button>
    </>
  ) : null;

  const addButton = canWrite && organizationId ? (
    <button className="btn btn-sm btn-outline-primary" onClick={openCreate}>
      <i className="fa fa-plus me-1" />Добавить {itemName.toLowerCase()}
    </button>
  ) : null;

  const modals = (
    <>
      {canWrite && (target || creating) && (
        <OrgDataEditor
          title={creating ? `Добавить ${itemName.toLowerCase()}` : `Редактировать: ${itemName.toLowerCase()}`}
          fields={fields}
          values={values}
          saving={busy}
          error={error}
          onChange={(name, value: OrgDataFormValue) => setValues((current) => ({ ...current, [name]: value }))}
          onSubmit={() => void save()}
          onClose={closeEditor}
        />
      )}
      {canWrite && deleteTarget && (
        <ConfirmModal
          title={`Удалить ${itemName.toLowerCase()}?`}
          text="Запись будет удалена без возможности восстановления."
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {error && !target && !creating && !deleteTarget && (
        <div className="alert alert-danger mt-3">{error}</div>
      )}
    </>
  );

  return { addButton, rowActions, modals, error };
}
