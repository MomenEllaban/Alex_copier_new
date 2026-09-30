"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import { useToast } from "@/components/UIProvider";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import PrinterLoader from "@/components/PrinterLoader";
import { notifyDataChanged } from "@/lib/data-events";
import { Boxes, RefreshCcw } from "lucide-react";

interface ReplacementContract {
  id: string;
  contractNumber: string;
  status: string;
  endDate: string;
  customer?: { id: string; name: string } | null;
}

interface ReplacementCandidate {
  id: string;
  serialNumber: string;
  manufacturer: string | null;
  model: string | null;
  currentStatus: string;
  isColor: boolean;
}

interface ReplacePayload {
  machine: {
    id: string;
    serialNumber: string;
    manufacturer: string | null;
    model: string | null;
  };
  contracts: ReplacementContract[];
  candidates: ReplacementCandidate[];
  companies: { id: string; name: string }[];
  /** Company that last placed the machine out; preselected as the receiver. */
  suggestedCompanyId: string | null;
  conditions: string[];
  reasons: string[];
}

export interface MachineBlockers {
  contracts: { id: string; contractNumber: string; status: string; endDate: string }[];
  serviceRequests: number;
  meterReadings: number;
  ownerHistory: number;
  replacements: number;
  copierTests: number;
  scrapOrder: { id: string; orderNumber: string; status: string } | null;
  warranty: { id: string; endDate: string; isExpired: boolean } | null;
}

const MACHINE_STATUS_AR: Record<string, string> = {
  SOLD: "مباع",
  RENTED: "مؤجرة",
  IN_WAREHOUSE: "في المستودع",
  UNDER_MAINTENANCE: "تحت الصيانة",
  UNDER_INSPECTION: "تحت الفحص",
  SCRAPPED: "مُتلفة",
};

/**
 * Explains why a machine cannot be deleted, and — when the blocker is a
 * customer contract — offers the replacement flow as the way out instead of
 * leaving the user at a dead end.
 */
export function DeleteBlockedModal({
  blockers,
  serialNumber,
  onClose,
  onReplace,
}: {
  blockers: MachineBlockers;
  serialNumber: string;
  onClose: () => void;
  onReplace: () => void;
}) {
  const { t } = useI18n();

  const rows: { label: string; value: string }[] = [];
  if (blockers.contracts.length > 0) {
    rows.push({
      label: t("replacement.blockers.contracts"),
      value: blockers.contracts.map((c) => c.contractNumber).join("، "),
    });
  }
  if (blockers.serviceRequests > 0)
    rows.push({ label: t("replacement.blockers.serviceRequests"), value: String(blockers.serviceRequests) });
  if (blockers.meterReadings > 0)
    rows.push({ label: t("replacement.blockers.meterReadings"), value: String(blockers.meterReadings) });
  if (blockers.replacements > 0)
    rows.push({ label: t("replacement.blockers.replacements"), value: String(blockers.replacements) });
  if (blockers.copierTests > 0)
    rows.push({ label: t("replacement.blockers.copierTests"), value: String(blockers.copierTests) });
  if (blockers.ownerHistory > 0)
    rows.push({ label: t("replacement.blockers.ownerHistory"), value: String(blockers.ownerHistory) });
  if (blockers.scrapOrder)
    rows.push({ label: t("replacement.blockers.scrapOrder"), value: blockers.scrapOrder.orderNumber });
  if (blockers.warranty)
    rows.push({ label: t("replacement.blockers.warranty"), value: "— " });

  const underContract = blockers.contracts.length > 0;

  return (
    <FormModal open onClose={onClose} title={t("replacement.deleteBlockedTitle")}>
      <div className="space-y-4">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("replacement.deleteBlockedHint")}
        </p>
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{serialNumber}</span>
        </p>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="font-medium text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>
        {underContract && (
          <button
            type="button"
            onClick={onReplace}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            <RefreshCcw size={16} />
            {t("replacement.action")}
          </button>
        )}
      </div>
    </FormModal>
  );
}

/**
 * Replace a machine that sits under a customer contract.
 *
 * Everything the form needs comes from one GET: the machine, its contracts, the
 * machines that can replace it, and the companies that can receive the returned
 * one. The receiving company is what decides where the returned machine lands,
 * so it is a required, explained field rather than a silent default.
 */
export default function ReplaceMachineModal({
  machineId,
  onClose,
  onDone,
}: {
  machineId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { success, error: toastError } = useToast();

  const [data, setData] = useState<ReplacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newMachineId, setNewMachineId] = useState("");
  const [contractId, setContractId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [tradeInValue, setTradeInValue] = useState("");
  const [condition, setCondition] = useState("");
  const [reason, setReason] = useState("CUSTOMER_REQUEST");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/machines/${machineId}/replace`);
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json.error ?? t("replacement.loadFailed"));
          return;
        }
        if (!active) return;
        setData(json);
        // One contract → preselect it; there is nothing to choose between.
        if (json.contracts?.length === 1) setContractId(json.contracts[0].id);
        // A returned machine goes back to the company that placed it out, so
        // that is already chosen unless there is nothing to go on.
        if (json.suggestedCompanyId) setCompanyId(json.suggestedCompanyId);
      } catch {
        if (active) setLoadError(t("replacement.loadFailed"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [machineId, t]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!companyId) {
        toastError("اختر الشركة المستلمة للماكينة المستردة");
        return;
      }
      setSaving(true);
      try {
        const res = await fetch(`/api/machines/${machineId}/replace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newMachineId: newMachineId || null,
            contractId: contractId || null,
            companyId,
            tradeInValue: tradeInValue === "" ? null : Number(tradeInValue),
            condition: condition || null,
            reason,
            notes,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          toastError(json.error ?? "فشل تنفيذ الاستبدال");
          return;
        }
        const r = json.replacement;
        success(
          t("replacement.doneDetail")
            .replace("{serial}", r.serialNumber)
            .replace("{company}", data?.companies.find((c) => c.id === r.companyId)?.name ?? r.companyId)
            .replace("{qty}", String(r.stockQuantity))
        );
        notifyDataChanged(["machines", "trade-ins", "products", "inventory", "contracts"]);
        onDone();
        onClose();
      } catch {
        toastError("فشل تنفيذ الاستبدال");
      } finally {
        setSaving(false);
      }
    },
    [machineId, newMachineId, contractId, companyId, tradeInValue, condition, reason, notes, data, success, toastError, onDone, onClose, t]
  );

  if (loading) {
    return (
      <FormModal open onClose={onClose} title={t("replacement.title")}>
        <PrinterLoader />
      </FormModal>
    );
  }

  if (loadError || !data) {
    return (
      <FormModal open onClose={onClose} title={t("replacement.title")}>
        <p className="text-sm text-red-600">{loadError ?? t("replacement.loadFailed")}</p>
      </FormModal>
    );
  }

  const oldMachineLabel = [data.machine.manufacturer, data.machine.model]
    .filter(Boolean)
    .join(" ");
  const fieldClass =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

  return (
    <FormModal open onClose={onClose} title={t("replacement.title")} wide>
      <form onSubmit={submit} className="space-y-5">
        <p className="text-sm text-slate-600">{t("replacement.subtitle")}</p>

        {/* What is being taken back */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className={`${labelClass} mb-1`}>{t("replacement.oldMachine")}</p>
          <p className="text-sm font-semibold text-slate-900">
            {oldMachineLabel || data.machine.serialNumber}
          </p>
          <p className="text-xs text-slate-500">{data.machine.serialNumber}</p>
          {data.contracts.length === 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              {t("replacement.noContracts")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="rp-company">
              {t("replacement.receivingCompany")} <span className="text-red-500">*</span>
            </label>
            <select
              id="rp-company"
              className={fieldClass}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              required
            >
              <option value="">{t("common.selectOption")}</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{t("replacement.receivingCompanyHint")}</p>
          </div>

          <div>
            <label className={labelClass} htmlFor="rp-contract">
              {t("replacement.contract")}
            </label>
            <select
              id="rp-contract"
              className={fieldClass}
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            >
              {data.contracts.length > 1 && <option value="">{t("replacement.allContracts")}</option>}
              {data.contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contractNumber}
                  {c.customer ? ` — ${c.customer.name}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="rp-reason">
              {t("replacement.reason")}
            </label>
            <select
              id="rp-reason"
              className={fieldClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {data.reasons.map((r) => (
                <option key={r} value={r}>
                  {t(`replacement.reasons.${r}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="rp-new">
              {t("replacement.newMachine")}
            </label>
            <select
              id="rp-new"
              className={fieldClass}
              value={newMachineId}
              onChange={(e) => setNewMachineId(e.target.value)}
            >
              <option value="">{t("replacement.newMachineOptional")}</option>
              {data.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.serialNumber}
                  {c.manufacturer || c.model ? ` — ${[c.manufacturer, c.model].filter(Boolean).join(" ")}` : ""}
                  {` (${MACHINE_STATUS_AR[c.currentStatus] ?? c.currentStatus})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="rp-condition">
              {t("replacement.condition")}
            </label>
            <select
              id="rp-condition"
              className={fieldClass}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="">{t("common.selectOption")}</option>
              {data.conditions.map((c) => (
                <option key={c} value={c}>
                  {t(`replacement.conditions.${c}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="rp-value">
              {t("replacement.tradeInValue")}
            </label>
            <input
              id="rp-value"
              type="number"
              min={0}
              step="0.01"
              className={fieldClass}
              value={tradeInValue}
              onChange={(e) => setTradeInValue(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="rp-notes">
              {t("replacement.notes")}
            </label>
            <textarea
              id="rp-notes"
              rows={2}
              className={fieldClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Say what will happen before it happens. */}
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-sky-800">
            <Boxes size={14} />
            {t("replacement.summary")}
          </p>
          <p className="text-xs text-sky-900">
            {newMachineId ? t("replacement.summarySwap") : t("replacement.summaryDetach")}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
          <SubmitButton
            disabled={saving || !companyId}
            loading={saving}
            loadingLabel={t("common.saving")}
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {t("replacement.submit")}
          </SubmitButton>
        </div>
      </form>
    </FormModal>
  );
}
