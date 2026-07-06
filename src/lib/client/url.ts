"use client";

export function appPath(path: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${basePath}${path}`;
}

export function apiPath(path: string) {
  return appPath(path);
}
