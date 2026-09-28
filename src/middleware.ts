import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const secureCookie = request.nextUrl.protocol === "https:";
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });
  const { pathname } = request.nextUrl;

  // الصفحات العامة
  const publicPaths = ["/login", "/api/auth"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // لو عايز يفتح login وهو مسجل دخول، رجعه للرئيسية
    if (token && pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // لو مش مسجل دخول، رجعه لصفحة تسجيل الدخول
  // ملاحظة: /api/* مستثنى من الـ matcher أدناه، فالـ middleware لا يحمي المسارات
  // إطلاقًا. كل API route يحمي نفسه بـ requireAuth/requirePageAccess/requireAction،
  // ويتحقق من ذلك في tests/api/route-auth-matrix.test.ts لكل method في كل route.
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
