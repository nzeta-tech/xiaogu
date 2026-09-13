import os
import tempfile
import json
import queue
import re
import threading
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel

app = FastAPI()
model = None
transcription_lock = threading.Lock()
MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
MAX_UPLOAD_BYTES = int(os.getenv("WHISPER_MAX_UPLOAD_BYTES", str(200 * 1024 * 1024)))
STREAM_HEARTBEAT_SECONDS = int(os.getenv("WHISPER_STREAM_HEARTBEAT_SECONDS", "10"))
MAX_TRANSCRIPT_CHARS = int(os.getenv("WHISPER_MAX_TRANSCRIPT_CHARS", "12000"))
SENTENCE_PAUSE_SECONDS = float(os.getenv("WHISPER_SENTENCE_PAUSE_SECONDS", "0.55"))
PARAGRAPH_PAUSE_SECONDS = float(os.getenv("WHISPER_PARAGRAPH_PAUSE_SECONDS", "1.2"))
DEFAULT_HOTWORDS = """CAR-T疗法，T细胞，免疫系统，淋巴瘤，阿基仑赛注射液，质子重离子，重疾险，重大疾病，轻症，中症，保额，保费，身故责任，三同原则，重大器官移植，百万医疗险，外购药，现金价值，保单贷款，万能账户，私募基金"""
HOTWORDS = os.getenv("WHISPER_HOTWORDS", DEFAULT_HOTWORDS).strip()
INITIAL_PROMPT = os.getenv(
    "WHISPER_INITIAL_PROMPT",
    "以下是简体中文保险、医疗和家庭财富规划口播。请准确识别专业术语、数字和产品条款，并输出自然中文标点。",
).strip()

TERMINAL_PUNCTUATION = "。！？!?"
TRAILING_PUNCTUATION = "，。！？；：、,.!?;:"
QUESTION_ENDINGS = (
    "吗", "呢", "么", "什么", "为什么", "怎么", "如何", "多少", "哪种", "哪类", "哪一个", "是不是", "有没有", "可以吗",
)
CONSERVATIVE_REPLACEMENTS = (
    ("同意意外事故", "同一意外事故"),
    ("同意医疗事件", "同一医疗事件"),
    ("同意疫苗事件", "同一医疗事件"),
    ("重大疾关移植", "重大器官移植"),
    ("治子中理子", "质子重离子"),
    ("阿基伦赛主事业", "阿基仑赛注射液"),
    ("阿基伦塞主事业", "阿基仑赛注射液"),
    ("阿基伦塞注射液", "阿基仑赛注射液"),
    ("咖啡疗法", "CAR-T疗法"),
    ("咖啡治疗", "CAR-T治疗"),
    ("Karty疗法", "CAR-T疗法"),
    ("KARTY疗法", "CAR-T疗法"),
    ("黎白流", "淋巴瘤"),
    ("I细胞清零", "癌细胞清零"),
    ("免系统", "免疫系统"),
    ("免细胞叫T细胞", "免疫细胞叫T细胞"),
    ("忙忙炒作", "盲目炒作"),
)
MEDICAL_CONTEXT = ("癌细胞", "T细胞", "血液类", "白血病", "淋巴", "肿瘤", "化疗", "放疗")
MEDICAL_REPLACEMENTS = (
    ("咖啡疙瘩", "CAR-T疗法"),
    ("咖啡疗法", "CAR-T疗法"),
    ("卡提疗法", "CAR-T疗法"),
    ("卡提治疗", "CAR-T治疗"),
    ("咖喱疗法", "CAR-T疗法"),
    ("体系包", "T细胞"),
    ("RAC包", "癌细胞"),
    ("黎巴流", "淋巴瘤"),
    ("离斑瘤", "淋巴瘤"),
)


def transcribe_options(language):
    # faster-whisper 1.2.1 can exhaust Whisper's decoding window when a long
    # `hotwords` prompt is combined with previous-segment context. Put the
    # compact glossary in the initial prompt instead so long videos retain
    # context without triggering "maximum decoding length must be > 0".
    glossary = f"专业词：{HOTWORDS}。" if HOTWORDS else ""
    return {
        "language": language,
        "vad_filter": True,
        "hotwords": None,
        "initial_prompt": f"{INITIAL_PROMPT}{glossary}" or None,
    }


def normalize_segment_text(value):
    text = re.sub(r"\s+", " ", str(value or "").replace("\ufffd", "")).strip()
    text = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", text)
    text = text.translate(str.maketrans({",": "，", ".": "。", "?": "？", "!": "！", ";": "；", ":": "："}))
    for source, target in CONSERVATIVE_REPLACEMENTS:
        text = text.replace(source, target)
    if any(marker in text for marker in MEDICAL_CONTEXT):
        for source, target in MEDICAL_REPLACEMENTS:
            text = text.replace(source, target)
        text = text.replace("民系统", "免疫系统")
    return text


def sentence_mark(text):
    clean = text.rstrip(TRAILING_PUNCTUATION)
    if clean.endswith(QUESTION_ENDINGS):
        return "？"
    return "。"


def finish_segment(text, gap_to_next=None):
    content = normalize_segment_text(text)
    if not content:
        return ""
    if content[-1] in TERMINAL_PUNCTUATION:
        suffix = "\n\n" if gap_to_next is not None and gap_to_next >= PARAGRAPH_PAUSE_SECONDS else ""
        return content + suffix
    content = content.rstrip(TRAILING_PUNCTUATION)
    if gap_to_next is None:
        return content + sentence_mark(content)
    if gap_to_next >= PARAGRAPH_PAUSE_SECONDS:
        return content + sentence_mark(content) + "\n\n"
    if gap_to_next >= SENTENCE_PAUSE_SECONDS:
        return content + sentence_mark(content)
    return content + "，"


def formatted_segments(segments):
    previous = None
    for segment in segments:
        content = normalize_segment_text(segment.text)
        if not content:
            continue
        current = (content, float(segment.start), float(segment.end))
        if previous is not None:
            gap = max(0.0, current[1] - previous[2])
            formatted = finish_segment(previous[0], gap)
            if formatted:
                yield formatted
        previous = current
    if previous is not None:
        formatted = finish_segment(previous[0])
        if formatted:
            yield formatted


def collect_transcript(segments, limit=MAX_TRANSCRIPT_CHARS):
    text = ""
    for content in formatted_segments(segments):
        if len(text) + len(content) > limit:
            content = content[: limit - len(text)]
        text += content
        if len(text) >= limit:
            break
    return text.strip()


def get_model():
    global model
    if model is None:
        model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
    return model


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME, "loaded": model is not None}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = "zh"):
    suffix = Path(file.filename or "source-media.mp4").suffix or ".mp4"
    total = 0
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as target:
        path = target.name
        try:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="media file is too large")
                target.write(chunk)
            with transcription_lock:
                segments, _ = get_model().transcribe(path, **transcribe_options(language))
                text = collect_transcript(segments)
            return {"text": text}
        finally:
            Path(path).unlink(missing_ok=True)


@app.post("/transcribe/stream")
async def transcribe_stream(file: UploadFile = File(...), language: str = "zh"):
    suffix = Path(file.filename or "source-media.mp4").suffix or ".mp4"
    total = 0
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as target:
        path = target.name
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                Path(path).unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="media file is too large")
            target.write(chunk)

    def transcribe_in_background(events):
        try:
            with transcription_lock:
                segments, _ = get_model().transcribe(path, **transcribe_options(language))
                text = ""
                for content in formatted_segments(segments):
                    if len(text) + len(content) > MAX_TRANSCRIPT_CHARS:
                        content = content[: MAX_TRANSCRIPT_CHARS - len(text)]
                    text += content
                    events.put({"type": "delta", "content": content})
                    if len(text) >= MAX_TRANSCRIPT_CHARS:
                        break
            events.put({"type": "done", "text": text.strip()})
        except Exception as error:
            events.put({"type": "error", "message": f"本地语音转写失败：{type(error).__name__}"})
        finally:
            Path(path).unlink(missing_ok=True)

    def event_stream():
        events = queue.Queue()
        worker = threading.Thread(target=transcribe_in_background, args=(events,), daemon=True)
        worker.start()
        while True:
            try:
                event = events.get(timeout=STREAM_HEARTBEAT_SECONDS)
            except queue.Empty:
                # Keep the HTTP/SSE connection alive while this request waits for
                # the single CPU Whisper slot or for the model's first segment.
                yield ": keep-alive\n\n"
                continue
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event["type"] in {"done", "error"}:
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
