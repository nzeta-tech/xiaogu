import os
from typing import Any, Callable

import wechatsogou
from fastapi import FastAPI, HTTPException, Query


app = FastAPI(title="WechatSogou adapter", version="1.0.0")


def build_client() -> wechatsogou.WechatSogouAPI:
    timeout = float(os.getenv("WECHATSOGOU_TIMEOUT_SECONDS", "12"))
    captcha_retries = int(os.getenv("WECHATSOGOU_CAPTCHA_RETRIES", "1"))
    return wechatsogou.WechatSogouAPI(
        captcha_break_time=max(1, min(captcha_retries, 19)),
        timeout=timeout,
    )


def reject_challenge(_: bytes) -> str:
    # The in-process adapter is non-interactive. Verification is completed in the existing
    # persistent browser instead of blocking a worker on stdin.
    return ""


def invoke(operation: Callable[[wechatsogou.WechatSogouAPI], Any]) -> Any:
    try:
        value = operation(build_client())
        if value is None:
            return None
        if isinstance(value, (dict, list, str, int, float, bool)):
            return value
        return list(value)
    except Exception as exc:
        message = str(exc)
        challenge = "captcha" in message.lower() or "vcode" in message.lower() or "验证码" in message
        raise HTTPException(status_code=429 if challenge else 502, detail=message[:1000]) from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "provider": "WechatSogou"}


@app.get("/v1/accounts/search")
def search_accounts(q: str = Query(min_length=1), page: int = Query(1, ge=1, le=10)) -> dict[str, Any]:
    data = invoke(lambda client: client.search_gzh(q, page=page, identify_image_callback=reject_challenge))
    return {"data": data or [], "meta": {"query": q, "page": page}}


@app.get("/v1/accounts/info")
def account_info(q: str = Query(min_length=1)) -> dict[str, Any]:
    data = invoke(lambda client: client.get_gzh_info(q, identify_image_callback=reject_challenge))
    return {"data": data}


@app.get("/v1/articles/search")
def search_articles(
    q: str = Query(min_length=1),
    page: int = Query(1, ge=1, le=10),
    timesn: int = Query(0, ge=0, le=5),
) -> dict[str, Any]:
    data = invoke(lambda client: client.search_article(
        q,
        page=page,
        timesn=timesn,
        identify_image_callback=reject_challenge,
    ))
    return {"data": data or [], "meta": {"query": q, "page": page, "timesn": timesn}}


@app.get("/v1/accounts/articles")
def account_articles(q: str | None = None, url: str | None = None) -> dict[str, Any]:
    if not q and not url:
        raise HTTPException(status_code=400, detail="q or url is required")
    data = invoke(lambda client: client.get_gzh_article_by_history(
        keyword=q,
        url=url,
        identify_image_callback_sogou=reject_challenge,
        identify_image_callback_weixin=reject_challenge,
    ))
    return {"data": data}


@app.get("/v1/articles/hot")
def hot_articles(hot_index: int = Query(0, ge=0, le=20), page: int = Query(1, ge=1, le=10)) -> dict[str, Any]:
    data = invoke(lambda client: client.get_gzh_article_by_hot(
        hot_index,
        page=page,
        identify_image_callback=reject_challenge,
    ))
    return {"data": data or [], "meta": {"hot_index": hot_index, "page": page}}
