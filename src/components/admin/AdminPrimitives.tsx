"use client";

import { ReactNode, useEffect } from "react";

export type AdminToastMessage = {
  id: number;
  tone: "success" | "error";
  message: string;
};

export function AdminToast({ toast, onDismiss }: { toast: AdminToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 3600);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div className={`adminToast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
      <span>{toast.message}</span>
      <button aria-label="关闭提示" onClick={onDismiss} type="button">×</button>
    </div>
  );
}

export type AdminConfirmConfig = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => void | Promise<void>;
};

export function AdminConfirmDialog({
  config,
  busy,
  confirmText,
  onConfirmTextChange,
  onCancel,
}: {
  config: AdminConfirmConfig | null;
  busy: boolean;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onCancel: () => void;
}) {
  if (!config) return null;
  const blocked = Boolean(config.requireText && confirmText !== config.requireText);
  return (
    <div className="adminModalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <section aria-labelledby="admin-confirm-title" aria-modal="true" className="adminConfirmDialog" role="dialog">
        <div className={`adminConfirmIcon ${config.danger ? "danger" : "warning"}`} aria-hidden="true">!</div>
        <div>
          <h2 id="admin-confirm-title">{config.title}</h2>
          <p>{config.description}</p>
        </div>
        {config.requireText ? (
          <label className="adminField adminConfirmField">
            <span>输入“{config.requireText}”确认</span>
            <input autoFocus value={confirmText} onChange={(event) => onConfirmTextChange(event.target.value)} />
          </label>
        ) : null}
        <div className="adminModalActions">
          <button className="secondaryButton" disabled={busy} onClick={onCancel} type="button">取消</button>
          <button className={config.danger ? "adminDangerButton" : "primaryButton"} disabled={busy || blocked} onClick={() => void config.onConfirm()} type="button">
            {busy ? "处理中…" : config.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function AdminDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="adminDrawerBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside aria-labelledby="admin-drawer-title" aria-modal="true" className="adminDrawer" role="dialog">
        <header>
          <div>
            <h2 id="admin-drawer-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button aria-label="关闭" className="adminIconButton" onClick={onClose} type="button">×</button>
        </header>
        <div className="adminDrawerBody">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function AdminToolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="adminToolbar">
      <div className="adminToolbarFilters">{children}</div>
      {actions ? <div className="adminToolbarActions">{actions}</div> : null}
    </div>
  );
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  return (
    <div className="adminPagination">
      <span>第 {start}–{end} 条，共 {total} 条</span>
      <label>
        每页
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button aria-label="上一页" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} type="button">‹</button>
      <strong>{safePage} / {pages}</strong>
      <button aria-label="下一页" disabled={safePage >= pages} onClick={() => onPageChange(safePage + 1)} type="button">›</button>
    </div>
  );
}

export function AdminLoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-label="数据加载中" className="adminLoadingRows" role="status">
      {Array.from({ length: rows }, (_, index) => <div key={index}><i /><i /><i /></div>)}
    </div>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="adminEmptyState">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function AdminStatus({ value }: { value: string }) {
  const labels: Record<string, string> = {
    active: "正常",
    inactive: "已停用",
    suspended: "已停用",
    paid: "已支付",
    pending: "待处理",
    failed: "失败",
    cancelled: "已取消",
    canceled: "已取消",
    refunded: "已退款",
    published: "已发布",
    draft: "草稿",
    open: "待处理",
    in_progress: "处理中",
    resolved: "已解决",
    closed: "已关闭",
    running: "运行中",
    high: "高优先级",
    normal: "普通",
    low: "低优先级",
    admin: "管理员",
    broker: "用户",
  };
  return <span className={`adminStatus ${value}`}>{labels[value] ?? value}</span>;
}

export function AdminField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="adminField">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function downloadAdminCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
