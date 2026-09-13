import { NextResponse, type NextRequest } from "next/server";

/**
 * Hard release boundary for capabilities that are present in the source tree
 * but are intentionally not part of the current production release. Returning
 * 404 avoids advertising an unavailable surface and also blocks direct API use.
 */
export function proxy(request: NextRequest) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    "/api/avatar/digital-human-looks/:path*",
    "/api/avatar/digital-human-voice-preview/:path*",
    "/api/avatar/digital-humans/:path*",
    "/api/avatar/generated-digital-humans/:path*",
    "/api/internal/local-agent/digital-human/:path*",
  ],
};
