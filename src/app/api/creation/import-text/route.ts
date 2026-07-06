import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { requireSessionUser } from "@/lib/auth/session";

const execFileAsync = promisify(execFile);
const BUNDLED_PYTHON = "/Users/a2251/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少上传文件" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (![".txt", ".md", ".pdf", ".docx"].includes(ext)) {
    return Response.json({ error: "当前仅支持 txt / md / pdf / docx" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (ext === ".txt" || ext === ".md") {
    const text = bytes.toString("utf8").trim();
    return Response.json({ text });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "creation-import-"));
  const tempFile = path.join(tempDir, sanitizeFilename(file.name) || `upload${ext}`);

  try {
    await fs.writeFile(tempFile, bytes);

    const script = `
import json
import sys
from pathlib import Path

file_path = Path(sys.argv[1])
suffix = file_path.suffix.lower()
text = ""

if suffix == ".pdf":
    import pdfplumber
    pages = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(page_text.strip())
    text = "\\n\\n".join(pages)
elif suffix == ".docx":
    from docx import Document
    doc = Document(file_path)
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    text = "\\n".join(paragraphs)
else:
    text = file_path.read_text(encoding="utf-8")

print(json.dumps({"text": text}, ensure_ascii=False))
`;

    const { stdout } = await execFileAsync(BUNDLED_PYTHON, ["-c", script, tempFile], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout) as { text?: string };
    return Response.json({ text: payload.text?.trim() ?? "" });
  } catch {
    return Response.json({ error: "文件解析失败，请换一个文件重试。" }, { status: 500 });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-");
}
