export const schoolIdentity = {
  name: "دبیرستان سید احمد خمینی",
  locale: "fa-IR",
  timeZone: "Asia/Tehran",
  direction: "rtl",
} as const;

export const roles = ["admin", "teacher", "student", "guardian"] as const;
export type Role = (typeof roles)[number];

export const attendanceStatuses = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const guardianRelationships = ["father", "mother", "legal_guardian", "other"] as const;
export type GuardianRelationship = (typeof guardianRelationships)[number];

export interface AbsenceSmsRecipient {
  guardianId: string;
  phoneE164: string;
  verified: boolean;
  enabledForAbsence: boolean;
}

/** Student contact information is deliberately not an input to guardian recipient selection. */
export function selectAbsenceSmsRecipients(
  guardians: readonly AbsenceSmsRecipient[],
): AbsenceSmsRecipient[] {
  return guardians.filter(
    (guardian) => guardian.verified && guardian.enabledForAbsence && /^\+[1-9]\d{7,14}$/.test(guardian.phoneE164),
  );
}

export function absenceSmsIdempotencyKey(attendanceRecordId: string): string {
  return `attendance:${attendanceRecordId}:guardian-absence`;
}
