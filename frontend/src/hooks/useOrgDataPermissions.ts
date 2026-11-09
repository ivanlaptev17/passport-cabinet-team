import { useOrgScope } from "./useOrgScope";

export function useOrgDataPermissions() {
  const { active, activePerms, context } = useOrgScope();
  const isGlobalAdmin = !!context?.is_global_admin;

  return {
    organizationId: active?.id ?? null,
    canWrite: isGlobalAdmin || !!activePerms?.can_write,
    canManage: isGlobalAdmin || !!activePerms?.can_manage,
  };
}
