"use client";

import { useEffect, useRef, useState } from "react";
import { apiPath } from "@/lib/client/url";
import styles from "./spoken-voices.module.css";

export type SpokenVoice = { id: string; name: string; status: string; provider: string; provider_voice_id: string; preview_audio_url: string; error_message?: string | null };
type Props = { voices: SpokenVoice[]; onRefresh: () => Promise<void> };

const reading = [
  "大家好，我是【你的名字】。很高兴通过这段视频认识你。接下来，我会用自然、清楚的方式，分享一些工作和生活中的思考。",
  "我主要关注家庭保障、风险管理和长期规划。面对问题，我会先了解真实需求，再解释规则、适用范围和需要注意的地方。",
  "比如做家庭保障规划，我会先梳理家庭成员、收入和已有保障，再分清哪些风险需要优先处理。信息越完整，选择也会更从容。",
  "我希望表达专业而亲切。遇到不确定的信息，我会如实说明，也会提醒大家结合自身情况判断。感谢你听完这段介绍，我们下次见。",
];
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function SpokenVoicesPanel({ voices, onRefresh }: Props) {
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordName, setRecordName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [voiceToDelete, setVoiceToDelete] = useState("");
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const savedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => { stream.current?.getTracks().forEach((track) => track.stop()); if (recordingUrl) URL.revokeObjectURL(recordingUrl); }, [recordingUrl]);

  const readyCount = voices.filter((voice) => voice.status === "ready").length;

  useEffect(() => {
    if (!voices.some(voice => voice.status === "creating")) return;
    const timer = window.setInterval(() => { void onRefresh().catch(() => {}); }, 5000);
    return () => window.clearInterval(timer);
  }, [voices, onRefresh]);
  async function retryVoice(id: string) {
    setBusy(`retry:${id}`);setError("");
    try {
      const response=await fetch(apiPath("/api/spoken-voices"),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,action:"retry"})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"重试失败");await onRefresh();
    }catch(error){setError(error instanceof Error?error.message:"重试失败");}finally{setBusy("");}
  }

  async function beginRecording() {
    setError(""); setNotice("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("当前浏览器不支持录音，请换用支持麦克风的浏览器"); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((item) => MediaRecorder.isTypeSupported(item));
      const current = new MediaRecorder(media, type ? { mimeType: type } : undefined);
      const chunks: BlobPart[] = [];
      current.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      current.onstop = () => {
        const result = new Blob(chunks, { type: current.mimeType || "audio/webm" });
        setRecordingSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
        setRecorded(result);
        setRecordingUrl(URL.createObjectURL(result));
        media.getTracks().forEach((track) => track.stop());
        stream.current = null; recorder.current = null; setRecording(false);
      };
      current.onerror = () => { setError("录音中断，请重试"); media.getTracks().forEach((track) => track.stop()); stream.current = null; recorder.current = null; setRecording(false); };
      recorder.current = current;
      setRecorded(null); setRecordingSeconds(0); startedAt.current = Date.now();
      current.start(); setRecording(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法使用麦克风"); }
  }
  function finishRecording() { if (recorder.current?.state === "recording") recorder.current.stop(); }
  function discardRecording() { setRecorded(null); setRecordName(""); setRecordingSeconds(0); setNotice("录音已清除，可以重新录制"); }

  async function saveRecording() {
    if (!recorded || busy) return;
    setBusy("record"); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("action", "record"); form.append("consent", "true"); form.append("name", recordName.trim() || "我的录制声音");
      form.append("recording", new File([recorded], "recording", { type: recorded.type }));
      const response = await fetch(apiPath("/api/spoken-voices"), { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "声音保存失败");
      await onRefresh(); setRecorded(null); setRecordName(""); setRecordingSeconds(0);
      setNotice("已保存，声音正在准备中。完成后即可用于口播视频。");
      window.setTimeout(() => savedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "声音保存失败，请重试"); }
    finally { setBusy(""); }
  }
  async function saveName(voice: SpokenVoice) {
    const name = draftName.trim();
    if (!name) { setError("请输入声音名称"); return; }
    if (name === voice.name) { setEditingId(""); return; }
    setBusy(`rename:${voice.id}`); setError("");
    try {
      const response = await fetch(apiPath("/api/spoken-voices"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: voice.id, name }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "重命名失败");
      await onRefresh(); setEditingId(""); setNotice("声音名称已更新");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "重命名失败"); }
    finally { setBusy(""); }
  }
  async function deleteVoice(id: string) {
    setBusy(`delete:${id}`); setError(""); setNotice("");
    try {
      const response = await fetch(apiPath("/api/spoken-voices"), { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除声音失败");
      await onRefresh(); setVoiceToDelete(""); setEditingId(""); setNotice("声音已从我的声音库移除");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除声音失败"); }
    finally { setBusy(""); }
  }

  return <div className={styles.page}>
    <div className={styles.summary} ref={savedRef}><div><span>我的声音</span><h4>{voices.length} 个声音 <small>· {readyCount} 个可用于口播</small></h4><p>录制自己的声音。准备好的声音会出现在视频生成第二步。</p></div><div className={styles.summaryMark}>♫</div></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {voices.length ? <div className={styles.savedVoices}>{voices.map((voice) => <article className={styles.savedCard} key={voice.id}><div className={styles.savedTop}><div className={styles.voiceIcon}>♪</div><div className={styles.voiceMeta}>{editingId === voice.id ? <div className={styles.renameRow}><input aria-label="新的声音名称" value={draftName} maxLength={80} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveName(voice); if (event.key === "Escape") setEditingId(""); }}/><button type="button" disabled={!!busy} onClick={() => void saveName(voice)}>保存</button><button type="button" onClick={() => setEditingId("")}>取消</button></div> : <strong>{voice.name}</strong>}<span>我的录制声音</span></div><span className={`${styles.status} ${voice.status === "ready" ? styles.ready : voice.status === "creating" ? styles.creating : styles.failed}`}>{voice.status === "ready" ? "可使用" : voice.status === "creating" ? "准备中" : "不可用"}</span></div>{voice.preview_audio_url ? <audio controls preload="none" src={voice.preview_audio_url}/> : null}{voice.status === "failed" && voice.error_message ? <p className={styles.failure}>{voice.error_message}</p> : null}{voiceToDelete === voice.id ? <div className={styles.deleteConfirm}><span>从声音库移除？</span><button type="button" className={styles.danger} disabled={!!busy} onClick={() => void deleteVoice(voice.id)}>{busy === `delete:${voice.id}` ? "删除中…" : "确认删除"}</button><button type="button" disabled={!!busy} onClick={() => setVoiceToDelete("")}>取消</button></div> : <div className={styles.savedActions}>{voice.status === "failed" ? <button type="button" disabled={!!busy} onClick={() => void retryVoice(voice.id)}>重试</button> : null}{editingId !== voice.id ? <button type="button" onClick={() => { setEditingId(voice.id); setDraftName(voice.name); setError(""); }}>重命名</button> : null}<button type="button" className={styles.deleteTrigger} disabled={!!busy} onClick={() => { setVoiceToDelete(voice.id); setEditingId(""); }}>删除</button></div>}</article>)}</div> : <p className={styles.empty}>还没有保存声音。可以先录一段自己的声音。</p>}
    <div className={styles.createHeading}><div><h4>添加声音</h4><p>朗读下方文稿，录制自己的声音。</p></div></div>
    <section className={styles.recordLayout}>
      <div className={styles.readingCard}><div className={styles.subheading}><span>01</span><div><h5>朗读文稿</h5><p>全文直接展开，照读即可。开头与结尾各留几秒安静时间。</p></div></div><div className={styles.script}><em>开始前保持安静 3 秒</em>{reading.map((line, index) => <p key={index}>{line}</p>)}<em>读完后保持安静 2 秒</em></div>{recording ? <button type="button" className={styles.stopButton} onClick={finishRecording}>■ 朗读完成，结束录音</button> : null}</div>
      <div className={styles.recordCard}><div className={styles.subheading}><span>02</span><div><h5>录制并保存</h5><p>在安静环境中自然朗读，尽量读完整段。</p></div></div><div className={`${styles.recorderDisplay} ${recording ? styles.isRecording : ""}`}><span className={styles.recordDot}/><strong>{recording ? clock(recordingSeconds) : recorded ? clock(recordingSeconds) : "准备录音"}</strong><small>{recording ? "正在录制，请继续朗读" : recorded ? "已录制，可以试听" : "开始后浏览器会请求麦克风权限"}</small></div><div className={styles.recordActions}>{recording ? <button type="button" className={styles.stopButton} onClick={finishRecording}>■ 结束录音</button> : <button type="button" className={styles.primary} disabled={!!busy} onClick={() => void beginRecording()}>{recorded ? "重新录制" : "● 开始录音"}</button>}</div>{recorded && !recording ? <div className={styles.recordResult}><label>试听录音<audio controls src={recordingUrl}/></label><label>声音名称<input value={recordName} maxLength={80} onChange={(event) => setRecordName(event.target.value)} placeholder="例如：我的自然口播声音"/></label><div className={styles.recordActions}><button type="button" className={styles.primary} disabled={!!busy} onClick={() => void saveRecording()}>{busy === "record" ? "正在保存并克隆…" : "保存为我的声音"}</button><button type="button" disabled={!!busy} onClick={discardRecording}>清除录音</button></div></div> : null}</div>
    </section>
  </div>;
}
