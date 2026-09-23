import { NextResponse, type NextRequest } from "next/server";

/** Keep the unreleased external editor hidden; spoken routes use their own auth. */
export function proxy(request: NextRequest) {
  const editor = request.nextUrl.pathname === "/workbuddy/video-editor"
    || request.nextUrl.pathname.startsWith("/workbuddy/video-editor/");
  if (editor && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/apps/digital-human-video/:path*",
    "/workbuddy/video-editor/:path*",
    "/api/digital-human-media/:path*",
    "/api/digital-human-reference-media/:path*",
    "/api/digital-human-resources/:path*",
    "/api/digital-human-template-favorites/:path*",
    "/api/digital-human-template-library/:path*",
    "/api/digital-human-videos/:path*",
    "/api/spoken-photos/:path*",
    "/api/spoken-photo-templates/:path*",
    "/api/spoken-voices/:path*",
    "/api/avatar/digital-human-looks/:path*",
    "/api/avatar/digital-human-voice-preview/:path*",
    "/api/avatar/digital-humans/:path*",
    "/api/avatar/generated-digital-humans/:path*",
    "/api/internal/local-agent/digital-human/:path*",
  ],
};
