import { timingSafeEqual } from "node:crypto";

export function isAuthorizedLocalAgentRequest(request: Request) {
  const expected = process.env.LOCAL_AGENT_TOKEN?.trim();
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function requireLocalAgent(request: Request) {
  if (!process.env.LOCAL_AGENT_TOKEN?.trim()) {
    return Response.json({ error: "local_agent_token_not_configured" }, { status: 503 });
  }
  return isAuthorizedLocalAgentRequest(request) ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
