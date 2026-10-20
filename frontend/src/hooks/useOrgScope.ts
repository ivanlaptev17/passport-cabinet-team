import { useAuth } from "../contexts/AuthContext";
import { useActiveOrg } from "../utils/activeOrg";
import { useTaskContext } from "./useTaskContext";

/** Кто смотрит и на какую организацию — общее для шапки, главной и разделов. */
export function useOrgScope() {
  const { user } = useAuth();
  const context = useTaskContext();
  const active = useActiveOrg();

  const role = user?.role_code ?? null;
  // Министерство и администратор системы видят все школы и выбирают нужную сами
  const isGlobal = role === "ADMIN" || role === "MINOBR";
  const isOmsu = role === "OMSU";
  const organizations = context?.organizations ?? [];
  const activePerms = active ? (organizations.find((o) => o.id === active.id) ?? null) : null;

  return {
    role,
    isGlobal,
    isOmsu,
    context,
    active,
    activePerms,
    organizations,
    canSwitch: isGlobal || organizations.length > 1,
    // министерство ещё не выбрало школу — разделы школы неактивны
    needsOrg: isGlobal && !active,
    // отпуска и ДР — Директору, Ответственному и Администратору ОО, плюс министерству
    canStaffCalendar: isGlobal || !!activePerms?.can_complete,
  };
}
