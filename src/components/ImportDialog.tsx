"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { buildTemplateCsv, downloadFile } from "@/lib/csv";
import { getColumns, type EntityKey, type ImportError } from "@/lib/import-schemas";
import FormModal from "@/components/FormModal";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  entity: EntityKey;
  title: string;
  onImported: () => void;
}

interface ImportResponse {
  created: number;
  errors: ImportError[];
}

export default function ImportDialog({ open, onClose, entity, title, onImported }: ImportDialogProps) {
  const { t, locale } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const columns = getColumns(entity);

  const downloadTemplate = () => {
    const headers = columns.map((c) => c.key);
    const sampleRows = [columns.map((c) => c.sample)];
    downloadFile(`${entity}-template.csv`, buildTemplateCsv(headers, sampleRows), "text/csv;charset=utf-8;");
  };

  const pickFile = (f: File | null) => {
    setFile(f);
    setResult(null);
    setFailed(false);
  };

  const readFileText = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(f, "UTF-8");
    });

  const handleSubmit = async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      const csv = await readFileText(file);
      const res = await fetch(`/api/${entity}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data: ImportResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setResult(null);
        setFailed(true);
      } else {
        setResult(data);
        if ((data.created ?? 0) > 0 && (!data.errors || data.errors.length === 0)) {
          onImported();
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }
    } catch {
      setResult(null);
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal open={open} onClose={onClose} title={title} wide>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <p className="text-sm text-gray-600 mb-3">{t("common.importInstructions")}</p>

        <button
          onClick={downloadTemplate}
          className="mb-4 border border-blue-600 text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium"
        >
          {t("common.downloadTemplate")}
        </button>

        <table className="w-full text-xs border border-gray-200 mb-4">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-right">{t("common.column")}</th>
              <th className="px-2 py-1.5 text-right">{t("common.description")}</th>
              <th className="px-2 py-1.5 text-center">{t("common.required")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {columns.map((c) => (
              <tr key={c.key}>
                <td className="px-2 py-1.5 font-mono">{c.key}</td>
                <td className="px-2 py-1.5">{locale === "ar" ? c.labelAr : c.labelEn}</td>
                <td className="px-2 py-1.5 text-center">{c.required ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,.txt"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm border border-gray-300 rounded-lg p-2 cursor-pointer"
        />

        <div className="mt-4 flex gap-2 justify-start">
          <button
            onClick={handleSubmit}
            disabled={!file || submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t("common.loading") : t("common.importSubmit")}
          </button>
          <button onClick={onClose} className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">
            {t("common.close")}
          </button>
        </div>

        {failed && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
            {t("common.importErrorGeneric")}
          </div>
        )}

        {result && (
          <div className="mt-4">
            {(result.errors?.length ?? 0) === 0 ? (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">
                {`${t("common.importSuccessPrefix")} ${result.created} ${t("common.rowsUnit")}`}
              </div>
            ) : result.created > 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg p-3 text-sm">
                {result.errors.map((err, i) => (
                  <p key={i}>
                    {`${t("common.rowWord")} ${err.row}${err.field ? ` (${err.field})` : ""}: ${err.message}`}
                  </p>
                ))}
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm max-h-64 overflow-y-auto">
                <p className="font-semibold text-red-800 mb-2">{t("common.importFailedTitle")}</p>
                <ul className="space-y-1 text-red-800">
                  {result.errors.map((err, i) => (
                    <li key={i} dir={locale === "ar" ? "rtl" : "ltr"}>
                      {`${t("common.rowWord")} ${err.row}${err.field ? ` (${err.field})` : ""}: ${err.message}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </FormModal>
  );
}
