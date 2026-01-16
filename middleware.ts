import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: [
    "/モバイル情報A.jpg",
    "/モバイル情報B.jpg",
    "/モバイル情報C.jpg",
    "/モバイル情報D.jpg",
  ],
};
