"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Printer, Mail, Lock, LogIn, User, Shield } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";

const testAccounts = [
  { name: "رضا", email: "reza@alex-copier.com", password: "password123", role: "المدير العام — كل حاجة في السيستم", color: "bg-purple-100 text-purple-700" },
  { name: "عمرو", email: "amr.manager@alex-copier.com", password: "password123", role: "مدير إداري — شركة القطاعي + الورشة", color: "bg-blue-100 text-blue-700" },
  { name: "حاتم", email: "hatem.accountant@alex-copier.com", password: "password123", role: "محاسب — كل حاجة في السيستم", color: "bg-green-100 text-green-700" },
  { name: "عمرو", email: "amr.accountant@alex-copier.com", password: "password123", role: "محاسب — كل حاجة في السيستم", color: "bg-emerald-100 text-emerald-700" },
  { name: "أحمد خالد", email: "ahmed.khaled@alex-copier.com", password: "password123", role: "الورشة — تسجيل الاختبارات + يومية الورشة", color: "bg-yellow-100 text-yellow-700" },
  { name: "مؤمن", email: "moemen.sales.parts@alex-copier.com", password: "password123", role: "موظف مبيعات — شركة جملة قطع غيار", color: "bg-pink-100 text-pink-700" },
  { name: "مؤمن", email: "moemen.sales.machines@alex-copier.com", password: "password123", role: "موظف مبيعات — شركة جملة آلات", color: "bg-orange-100 text-orange-700" },
  { name: "مؤمن", email: "moemen.engineer@alex-copier.com", password: "password123", role: "مهندس صيانة", color: "bg-cyan-100 text-cyan-700" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    } else {
      router.push("/");
      return;
    }

    setLoading(false);
  };

  const handleTestLogin = async (testEmail: string, testPassword: string) => {
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email: testEmail,
      password: testPassword,
      redirect: false,
    });

    if (result?.error) {
      setError("فشل تسجيل الدخول للحساب التجريبي");
    } else {
      router.push("/");
      return;
    }

    setLoading(false);
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col lg:flex-row bg-gray-50">
      {loading && <PrinterLoader fullScreen label="جاري تسجيل الدخول..." />}
      {/* Right side — Logo + Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-4 py-8 sm:p-8 lg:p-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 sm:mb-10">
            <div className="flex justify-center mb-4 sm:mb-5">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/25">
                <Printer className="h-7 w-7 sm:h-10 sm:w-10 text-white" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">اليكس كوبير</h1>
            <p className="text-gray-500 text-sm sm:text-base">Alex Copier ERP System</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-8">
            <h2 className="text-xl font-bold text-gray-800 mb-1">تسجيل الدخول</h2>
            <p className="text-sm text-gray-500 mb-6">أدخل بياناتك للدخول إلى النظام</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني</label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full ps-10 pe-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-start text-base sm:text-sm"
                    placeholder="example@alex-copier.com"
                  />
                  <Mail size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور</label>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full ps-10 pe-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-start text-base sm:text-sm"
                    placeholder="••••••••"
                  />
                  <Lock size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-xl border border-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <LogIn size={18} />
                {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Left side — Test accounts */}
      <div className="w-full lg:w-1/2 bg-gradient-to-br from-gray-900 to-gray-800 px-4 py-8 sm:p-8 lg:p-16 flex flex-col justify-center">
        <div className="max-w-lg w-full mx-auto">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm shrink-0">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">حسابات تجريبية</h2>
              <p className="text-gray-400 text-xs sm:text-sm">اختر أي حساب للدخول السريع</p>
            </div>
          </div>

          <div className="space-y-3">
            {testAccounts.map((account) => (
              <button
                key={account.email}
                onClick={() => handleTestLogin(account.email, account.password)}
                disabled={loading}
                className="w-full flex items-center gap-4 bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 transition-all text-start disabled:opacity-50 group"
              >
                <div className="w-11 h-11 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-white/20 transition-colors">
                  <User size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-white font-medium text-sm">{account.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${account.color}`}>
                      {account.role}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs truncate">{account.email}</p>
                </div>
                <LogIn size={18} className="text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
