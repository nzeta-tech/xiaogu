import Link from "next/link";
import styles from "./video-editor.module.css";

export const dynamic = "force-dynamic";

export default function WorkbuddyVideoEditorPage() {
  const editorUrl = process.env.OPENCHATCUT_BROWSER_URL?.trim() || "http://localhost:5199";
  return (
    <main className={styles.workspace}>
      <Link className={styles.back} href="/workbuddy" aria-label="返回 WorkBuddy" title="返回 WorkBuddy">
        <span aria-hidden="true">←</span>
      </Link>
      <iframe
        className={styles.editor}
        src={editorUrl}
        title="小谷视频编辑工作台"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </main>
  );
}
