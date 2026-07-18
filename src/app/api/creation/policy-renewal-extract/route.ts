import path from "node:path";
import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { requireSessionUser } from "@/lib/auth/session";
import { extractPolicyRenewalFields } from "@/lib/creation/policy-renewal-extraction";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const supportedExtensions = new Set([".txt", ".md", ".pdf", ".docx"]);

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少上传文件" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "文件不能超过 10MB" }, { status: 413 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!supportedExtensions.has(ext)) {
    return Response.json({ error: "当前仅支持 txt / md / pdf / docx" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (ext === ".txt" || ext === ".md") {
      text = bytes.toString("utf8");
    } else if (ext === ".pdf") {
      text = (await pdf(bytes)).text;
    } else {
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    }

    const result = extractPolicyRenewalFields(text);
    return Response.json({
      fields: result.fields,
      missing: result.missing,
      text: result.normalizedText,
    });
  } catch {
    return Response.json({ error: "文件解析失败，请确认文件未加密或损坏。" }, { status: 422 });
  }
}
