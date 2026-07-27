import os
import tempfile
import json
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel

app = FastAPI()
model = None
MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
MAX_UPLOAD_BYTES = int(os.getenv("WHISPER_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))


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
            segments, _ = get_model().transcribe(path, language=language, vad_filter=True)
            text = "".join(segment.text for segment in segments).strip()
            return {"text": text[:12000]}
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

    def event_stream():
        try:
            segments, _ = get_model().transcribe(path, language=language, vad_filter=True)
            text = ""
            for segment in segments:
                content = segment.text.strip()
                if not content:
                    continue
                if len(text) + len(content) > 12000:
                    content = content[: 12000 - len(text)]
                text += content
                yield f"data: {json.dumps({'type': 'delta', 'content': content}, ensure_ascii=False)}\n\n"
                if len(text) >= 12000:
                    break
            yield f"data: {json.dumps({'type': 'done', 'text': text}, ensure_ascii=False)}\n\n"
        except Exception:
            yield f"data: {json.dumps({'type': 'error', 'message': '本地语音转写失败。'}, ensure_ascii=False)}\n\n"
        finally:
            Path(path).unlink(missing_ok=True)

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
