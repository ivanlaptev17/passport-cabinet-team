import { useAuth } from "../contexts/AuthContext";
import { useActiveOrg } from "../utils/activeOrg";
import { useTaskContext } from "./useTaskContext";

export type RoleBadge = { label: string; icon: string };

/** Подпись текущей роли для шапки. У сотрудников школы роль своя в каждой
 *  организации, поэтому берётся роль в выбранной, а не общая. */
function roleBadge(
  role: string | null,
  loaded: boolean,
  hasOrgs: boolean,
  orgRoleCode: string | null,
  orgRoleLabel: string | null,
  roleName: string | null,
): RoleBadge | null {
  if (role === "MINOBR") return { label: "Министерство образования", icon: "fa-building-columns" };
  if (role === "ADMIN") return { label: "Администратор системы", icon: "fa-user-shield" };
  if (role === "OMSU") return { label: "ОМСУ", icon: "fa-landmark" };
  // до загрузки организаций не угадываем: ответственный мелькнул бы «сотрудником»
  if (!loaded) return null;
  if (orgRoleLabel) return { label: orgRoleLabel, icon: orgRoleCode === "DIRECTOR" ? "fa-user-tie" : "fa-user" };
  // организации есть, но выбранная ещё не подставилась — ждём, а не показываем общую роль
  if (hasOrgs) return null;
  return roleName ? { label: roleName, icon: "fa-user" } : null;
}

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
    roleBadge: roleBadge(
      role,
      !!context,
      organizations.length > 0,
      activePerms?.org_role_code ?? null,
      activePerms?.org_role_label ?? null,
      user?.role_name ?? null,
    ),
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
