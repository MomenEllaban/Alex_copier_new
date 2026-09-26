import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert size={26} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">غير مصرح لك</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          الصفحة دي مش متاحة لحسابك. لو شفت خطأ، كلّم مدير النظام.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          رجوع للرئيسية
        </Link>
      </div>
    </div>
  );
}
