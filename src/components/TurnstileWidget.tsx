"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string; remove: (id: string) => void };
  }
}

export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widgetId = "";
    let cancelled = false;
    const render = () => {
      if (cancelled || !hostRef.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-xiaogu-turnstile="true"]');
    if (existing) {
      if (window.turnstile) render(); else existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.xiaoguTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, siteKey]);
  return <div className="turnstileHost" ref={hostRef} />;
}
