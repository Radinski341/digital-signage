import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
export default withAuth(
  function middleware(req) {
    const headers = new Headers(req.headers);
    headers.delete("x-public-path");
    if (
      !/^\/(admin|preview|banner|slide|settings)(\/|$)/.test(
        req.nextUrl.pathname,
      )
    )
      headers.set("x-public-path", req.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  },
  {
    pages: { signIn: "/admin/login" },
    callbacks: {
      authorized: ({ token, req }) =>
        !/^\/(admin|preview)(\/|$)/.test(req.nextUrl.pathname) ||
        req.nextUrl.pathname === "/admin/login" ||
        Boolean(token),
    },
  },
);
export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$|images(?:/|$)|uploads(?:/|$)|test-fixtures(?:/|$)).*)",
  ],
};
