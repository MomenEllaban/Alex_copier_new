import { normalizeArabicName } from "./normalize";

// Access [نوع العقد] -> ERP ContractType.
// "هله" is a one-row typo kept as VISIT (same customer already has a visit row).

export type AccessContractType =
  | "RENTAL"
  | "VISIT"
  | "ARCHIVE"
  | "MAINTENANCE_ONLY"
  | "WARRANTY"
  | "PENDING";

const MAP: Record<string, AccessContractType> = {
  [normalizeArabicName("ايجار")]: "RENTAL",
  [normalizeArabicName("زيارة")]: "VISIT",
  [normalizeArabicName("ارشيف")]: "ARCHIVE",
  [normalizeArabicName("صيانة")]: "MAINTENANCE_ONLY",
  [normalizeArabicName("ضمان")]: "WARRANTY",
  [normalizeArabicName("مطلوب عقد")]: "PENDING",
  [normalizeArabicName("هله")]: "VISIT",
};

export function mapContractType(raw: string | null | undefined): {
  type: AccessContractType;
  flagged: boolean;
} {
  const key = normalizeArabicName(raw);
  if (!key) return { type: "PENDING", flagged: true };
  const mapped = MAP[key];
  if (!mapped) return { type: "PENDING", flagged: true };
  return { type: mapped, flagged: key === normalizeArabicName("هله") };
}

export const CONTRACT_TYPE_AR: Record<AccessContractType, string> = {
  RENTAL: "ايجار",
  VISIT: "زيارة",
  ARCHIVE: "ارشيف",
  MAINTENANCE_ONLY: "صيانة",
  WARRANTY: "ضمان",
  PENDING: "مطلوب عقد",
};
