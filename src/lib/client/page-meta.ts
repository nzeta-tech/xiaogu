"use client";

import { useEffect } from "react";

export type PageMetaDetail = {
  title: string;
  description: string;
  status?: string;
};

const PAGE_META_EVENT = "xiaogu:page-meta";
const PAGE_META_REQUEST_EVENT = "xiaogu:page-meta-request";

export function usePageMeta(detail: PageMetaDetail) {
  const { title, description, status = "" } = detail;

  useEffect(() => {
    const current = { title, description, status };
    const publish = () => window.dispatchEvent(new CustomEvent<PageMetaDetail>(PAGE_META_EVENT, { detail: current }));
    const frame = window.requestAnimationFrame(publish);
    window.addEventListener(PAGE_META_REQUEST_EVENT, publish);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(PAGE_META_REQUEST_EVENT, publish);
      window.requestAnimationFrame(() => window.dispatchEvent(new Event(PAGE_META_REQUEST_EVENT)));
    };
  }, [description, status, title]);
}

export function listenForPageMeta(listener: (detail: PageMetaDetail) => void) {
  const handle = (event: Event) => listener((event as CustomEvent<PageMetaDetail>).detail);
  window.addEventListener(PAGE_META_EVENT, handle);
  window.dispatchEvent(new Event(PAGE_META_REQUEST_EVENT));
  return () => window.removeEventListener(PAGE_META_EVENT, handle);
}
