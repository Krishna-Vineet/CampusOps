export const ACCOUNT_TYPES = ["COLLEGE_STUDENT", "OUTSIDER_STUDENT", "STAFF"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  COLLEGE_STUDENT: "College student",
  OUTSIDER_STUDENT: "Outside student",
  STAFF: "Staff",
};

export const ACCOUNT_STATUSES = [
  "PENDING_EMAIL",
  "PENDING_VERIFICATION",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * HOD/Dean is one institutional role category.
 * The database enum value is HOD_DEAN; the UI label is "HOD/Dean".
 */
export const GLOBAL_ROLES = ["ADMIN", "FACULTY", "HOD_DEAN", "SUPPORT"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = {
  ADMIN: "Admin / Principal",
  FACULTY: "Faculty",
  HOD_DEAN: "HOD/Dean",
  SUPPORT: "Support",
};

export const ROLE_SCOPES = ["GLOBAL", "DEPARTMENT"] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

export const CLUB_ROLES = ["LEAD", "COORDINATOR", "FACULTY"] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];

export const APPROVAL_TIERS = ["FACULTY", "SENIOR", "ADMIN"] as const;
export type ApprovalTier = (typeof APPROVAL_TIERS)[number];

export const ROLE_TO_APPROVAL_TIER: Partial<Record<GlobalRole, ApprovalTier>> = {
  FACULTY: "FACULTY",
  HOD_DEAN: "SENIOR",
  ADMIN: "ADMIN",
};

/** Approval tiers are internal routing steps; approvers see the role name. */
export const APPROVAL_TIER_LABELS: Record<ApprovalTier, string> = {
  FACULTY: "Faculty",
  SENIOR: "HOD/Dean",
  ADMIN: "Admin / Principal",
};

/**
 * FACULTY is a club membership, not an advisor: the department's HOD/Dean (or
 * Admin) adds faculty to a club, and those faculty organise and scan at its
 * events alongside the coordinators.
 */
export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  LEAD: "Club lead",
  COORDINATOR: "Coordinator",
  FACULTY: "Club faculty",
};
