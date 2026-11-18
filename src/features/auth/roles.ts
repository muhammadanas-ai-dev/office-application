import type { WorkspaceRole } from "@/types/database.types";

/** Lowest privilege first. A role can do everything a lower role can. */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export const WORKSPACE_ROLES: WorkspaceRole[] = [
  "viewer",
  "commenter",
  "editor",
  "admin",
  "owner",
];

/** True when `role` is at least `required`. Unknown roles get nothing. */
export function canPerform(
  role: WorkspaceRole | null | undefined,
  required: WorkspaceRole
): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** True when `role` is a member role that may change other members. */
export function canManageMembers(role: WorkspaceRole | null | undefined) {
  return canPerform(role, "admin");
}
