"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Camera, History, ImagePlus, Trash2, X } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { hasPageAccess } from "@/lib/permissions";
import { apiErrorMessage } from "@/lib/api-client";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import PrinterLoader from "@/components/PrinterLoader";
import { useConfirm, useToast } from "@/components/UIProvider";

export interface CopierTestMachine {
  id: string;
  serialNumber: string;
  model?: string | null;
}

interface CopierTest {
  id: string;
  pageCount: number;
  imageUrl: string;
  notes?: string | null;
  testDate: string;
  engineer: { id: string; name: string };
  machine?: { id: string; serialNumber: string; model?: string | null } | null;
}

interface EngineerOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface MachineOption {
  id: string;
  serialNumber: string;
  model?: string | null;
  ownerName?: string | null;
}

interface CopierTestsProps {
  customerId: string;
  machines?: CopierTestMachine[];
}

const todayInput = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CopierTests({ customerId, machines = [] }: CopierTestsProps) {
  const { t, locale, dir } = useI18n();
  const { data: session } = useSession();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canWrite = hasPageAccess(role, "customers") || hasPageAccess(role, "serviceRequests");
  const canDelete = role === "GENERAL_MANAGER";

  const [tests, setTests] = useState<CopierTest[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [fallbackMachines, setFallbackMachines] = useState<MachineOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [engineerId, setEngineerId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [notes, setNotes] = useState("");
  const [testDate, setTestDate] = useState(todayInput());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  const fetchAll = async () => {
    try {
      const [testsRes, engineersRes] = await Promise.all([
        fetch(`/api/customers/${customerId}/tests`),
        fetch("/api/engineers"),
      ]);
      if (testsRes.ok) {
        const data = await testsRes.json();
        setTests(Array.isArray(data) ? data : []);
      }
      if (engineersRes.ok) {
        const data = await engineersRes.json();
        setEngineers(
          (Array.isArray(data) ? data : []).filter((e: EngineerOption) => e.isActive !== false),
        );
      }
      // If the customer has no linked machines, offer all machines so the
      // machine field always has an input (optional to fill).
      if (machines.length === 0) {
        const machinesRes = await fetch("/api/machines");
        if (machinesRes.ok) {
          const data = await machinesRes.json();
          setFallbackMachines(
            (Array.isArray(data) ? data : []).map(
              (m: { id: string; serialNumber: string; model?: string | null; currentOwner?: { name?: string } | null }) => ({
                id: m.id,
                serialNumber: m.serialNumber,
                model: m.model ?? null,
                ownerName: m.currentOwner?.name ?? null,
              }),
            ),
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const clearImage = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setImageFile(null);
    setPreviewUrl(null);
  };

  const handleImageChange = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setImageFile(file);
    setPreviewUrl(previewRef.current);
  };

  const formatDate = (value: string) => {
    const d = new Date(value);
    const loc = locale === "ar" ? "ar-EG" : "en-GB";
    return `${d.toLocaleDateString(loc)} ${d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`;
  };

  const resetForm = () => {
    setEngineerId("");
    setMachineId("");
    setPageCount("");
    setNotes("");
    setTestDate(todayInput());
    clearImage();
    setFormError("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!engineerId) {
      setFormError(t("copierTests.engineerRequired"));
      return;
    }
    const count = Number(pageCount);
    if (!Number.isInteger(count) || count <= 0) {
      setFormError(t("copierTests.pageCountRequired"));
      return;
    }
    if (!imageFile) {
      setFormError(t("copierTests.imageRequired"));
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("engineerId", engineerId);
      formData.append("pageCount", String(count));
      formData.append("image", imageFile);
      if (notes.trim()) formData.append("notes", notes.trim());
      if (testDate) formData.append("testDate", new Date(testDate).toISOString());
      if (machineId) formData.append("machineId", machineId);

      const res = await fetch(`/api/customers/${customerId}/tests`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(apiErrorMessage(data, t));
        return;
      }
      resetForm();
      await fetchAll();
      toastSuccess(t("copierTests.testSaved"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("copierTests.deleteTestConfirm") }))) return;
    const res = await fetch(`/api/tests/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    setTests((prev) => prev.filter((item) => item.id !== id));
    toastSuccess(t("copierTests.testDeleted"));
  };

  const latest = tests[0] ?? null;
  const customerMachines: MachineOption[] = machines;
  const machineOptions: MachineOption[] =
    customerMachines.length > 0 ? customerMachines : fallbackMachines;
  const machineLabel = (m: MachineOption) =>
    `${m.serialNumber}${m.model ? ` — ${m.model}` : ""}${m.ownerName ? ` (${m.ownerName})` : ""}`;

  return (
    <div dir={dir} className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-900">
          <Camera size={16} className="shrink-0" />
          {t("copierTests.title")}
          {tests.length > 0 && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              {tests.length}
            </span>
          )}
        </h3>
        {tests.length > 0 && (
          <button
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            <History size={14} className="shrink-0" />
            {t("copierTests.viewAllTests")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-[120px] items-center justify-center">
          <PrinterLoader size="sm" label={t("common.loading")} />
        </div>
      ) : (
        <>
          {latest ? (
            <div className="mb-4 rounded-xl border border-violet-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-violet-500 uppercase">
                {t("copierTests.latestTest")}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={() => setLightboxUrl(latest.imageUrl)}
                  className="shrink-0 overflow-hidden rounded-lg border border-gray-200"
                  title={t("copierTests.image")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={latest.imageUrl}
                    alt={t("copierTests.testImage")}
                    className="h-24 w-32 object-cover transition hover:opacity-90"
                  />
                </button>
                <div className="grid flex-1 grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <span className="block text-xs text-gray-500">{t("copierTests.date")}</span>
                    <span className="font-semibold whitespace-nowrap text-slate-800">
                      {formatDate(latest.testDate)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500">{t("copierTests.engineer")}</span>
                    <span className="font-semibold text-slate-800">{latest.engineer.name}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500">{t("copierTests.pageCount")}</span>
                    <span className="font-bold text-violet-700">
                      {latest.pageCount.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}
                    </span>
                  </div>
                  {latest.machine && (
                    <div>
                      <span className="block text-xs text-gray-500">{t("copierTests.machine")}</span>
                      <span className="font-medium text-slate-800" dir="ltr">
                        {latest.machine.serialNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mb-4 rounded-xl border border-dashed border-violet-300 bg-white px-3 py-4 text-center text-sm text-gray-500">
              {t("copierTests.noTests")}
            </p>
          )}

          {canWrite && (
            <form onSubmit={handleSave} className="rounded-xl border border-violet-200 bg-white p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-900">{t("copierTests.addTest")}</h4>
              {formError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("copierTests.engineer")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={engineerId}
                    onChange={(e) => setEngineerId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  >
                    <option value="">{t("copierTests.selectEngineer")}</option>
                    {engineers.map((eng) => (
                      <option key={eng.id} value={eng.id}>
                        {eng.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("copierTests.pageCount")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                    placeholder="1000"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("copierTests.optionalMachine")}
                  </label>
                  <select
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  >
                    <option value="">{t("copierTests.chooseMachine")}</option>
                    {machineOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {machineLabel(m)}
                      </option>
                    ))}
                  </select>
                  {customerMachines.length === 0 && fallbackMachines.length > 0 && (
                    <p className="text-xs text-gray-500">{t("copierTests.noCustomerMachinesHint")}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("copierTests.testDate")}
                  </label>
                  <input
                    type="datetime-local"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("copierTests.notes")}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder={t("copierTests.notesPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("copierTests.testImage")} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100">
                      <ImagePlus size={16} className="shrink-0" />
                      {imageFile ? t("copierTests.changeImage") : t("copierTests.uploadImage")}
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        className="hidden"
                        onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {previewUrl && (
                      <div className="relative inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt={t("copierTests.testImage")}
                          className="h-20 w-28 rounded-lg border border-gray-200 object-cover"
                        />
                        <button
                          type="button"
                          onClick={clearImage}
                          aria-label={t("common.delete")}
                          className="absolute -top-2 -end-2 rounded-full bg-red-600 p-1 text-white shadow transition hover:bg-red-700"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <SubmitButton
                  loading={saving}
                  label={t("copierTests.saveTest")}
                  loadingLabel={t("copierTests.savingTest")}
                  className="bg-violet-600 text-white hover:bg-violet-700"
                >
                  <Camera size={16} />
                </SubmitButton>
              </div>
              {saving && (
                <div className="mt-3 flex justify-center">
                  <PrinterLoader size="sm" label={t("copierTests.savingTest")} />
                </div>
              )}
            </form>
          )}
        </>
      )}

      <FormModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title={`${t("copierTests.testsHistory")} (${tests.length})`}
        wide
      >
        {tests.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t("copierTests.noTests")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">
                    {t("copierTests.date")}
                  </th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">
                    {t("copierTests.engineer")}
                  </th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">
                    {t("copierTests.machine")}
                  </th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">
                    {t("copierTests.pageCount")}
                  </th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">
                    {t("copierTests.image")}
                  </th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">
                    {t("copierTests.notes")}
                  </th>
                  {canDelete && (
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">
                      {t("copierTests.actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tests.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-700">
                      {formatDate(item.testDate)}
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800">{item.engineer.name}</td>
                    <td className="px-4 py-2 text-slate-700" dir="ltr">
                      {item.machine?.serialNumber || "—"}
                    </td>
                    <td className="px-4 py-2 font-bold text-violet-700">
                      {item.pageCount.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => setLightboxUrl(item.imageUrl)} title={t("copierTests.image")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt={t("copierTests.testImage")}
                          className="h-12 w-16 rounded-lg border border-gray-200 object-cover transition hover:opacity-80"
                        />
                      </button>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-slate-600">
                      {item.notes || "—"}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleDelete(item.id)}
                          title={t("common.delete")}
                          aria-label={t("common.delete")}
                          className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormModal>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt={t("copierTests.testImage")}
              className="max-h-[90vh] w-auto rounded-xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              aria-label={t("common.close")}
              className="absolute top-2 end-2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
