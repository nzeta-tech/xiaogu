/** Read clipboard files only; ordinary text and copied HTML keep native paste behavior. */
export function clipboardImageFiles(data: Pick<DataTransfer, "items" | "files">): File[] {
  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  const files = itemFiles.length ? itemFiles : Array.from(data.files ?? []);
  const extensions: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  };
  return files.filter((file) => file.type.startsWith("image/")).map((file) => {
    const extension = extensions[file.type];
    // Clipboard screenshots may have a generic name or no extension.
    if (!extension || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) return file;
    return new File([file], `粘贴图片-${crypto.randomUUID()}.${extension}`, {
      type: file.type, lastModified: file.lastModified,
    });
  });
}
