import { normalizeArabicName } from "./normalize";

// Access [نوع العقد] -> ERP ContractType.
// Types requested: أرشيف (ARCHIVE), إيجار (RENTAL), صيانة (MAINTENANCE), زيارة (VISIT), ضمان (WARRANTY), مطلوب عقد (CONTRACT_REQUIRED).

export type AccessContractType =
  | "ARCHIVE"
  | "RENTAL"
  | "MAINTENANCE"
  | "VISIT"
  | "WARRANTY"
  | "CONTRACT_REQUIRED";

const MAP: Record<string, AccessContractType> = {
  [normalizeArabicName("ارشيف")]: "ARCHIVE",
  [normalizeArabicName("أرشيف")]: "ARCHIVE",
  [normalizeArabicName("ايجار")]: "RENTAL",
  [normalizeArabicName("إيجار")]: "RENTAL",
  [normalizeArabicName("صيانه")]: "MAINTENANCE",
  [normalizeArabicName("صيانة")]: "MAINTENANCE",
  [normalizeArabicName("زياره")]: "VISIT",
  [normalizeArabicName("زيارة")]: "VISIT",
  [normalizeArabicName("ضمان")]: "WARRANTY",
  [normalizeArabicName("مطلوب عقد")]: "CONTRACT_REQUIRED",
  [normalizeArabicName("هله")]: "VISIT",
};

export function mapContractType(raw: string | null | undefined): {
  type: AccessContractType;
  flagged: boolean;
} {
  const key = normalizeArabicName(raw);
  if (!key) return { type: "CONTRACT_REQUIRED", flagged: true };
  const mapped = MAP[key];
  if (!mapped) return { type: "CONTRACT_REQUIRED", flagged: true };
  return { type: mapped, flagged: key === normalizeArabicName("هله") };
}

export const CONTRACT_TYPE_AR: Record<AccessContractType, string> = {
  ARCHIVE: "ارشيف",
  RENTAL: "ايجار",
  MAINTENANCE: "صيانه",
  VISIT: "زياره",
  WARRANTY: "ضمان",
  CONTRACT_REQUIRED: "مطلوب عقد",
};
