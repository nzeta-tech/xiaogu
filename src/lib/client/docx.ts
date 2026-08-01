const encoder = new TextEncoder();

type DocxImage = { data: Uint8Array; width: number; height: number; relationId: string; fileName: string; sourceIndex: number };

export async function articleDocx(title: string, source: Element | null, fallbackText: string) {
  const images = source ? await collectImages(source) : [];
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", content: documentXml(title, source, fallbackText, images) },
    { name: "word/_rels/document.xml.rels", content: documentRelationships(images) },
    ...images.map((image) => ({ name: `word/media/${image.fileName}`, content: image.data })),
  ];
  return new Blob([zip(files)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function documentXml(title: string, source: Element | null, fallbackText: string, images: DocxImage[]) {
  const sourceImages = Array.from(source?.querySelectorAll("img") ?? []);
  const imageMap = new Map(images.map((image) => [sourceImages[image.sourceIndex], image]));
  const blocks = source ? Array.from(source.querySelectorAll("h1,h2,h3,p,li,blockquote,img")).map((element) => {
    if (element instanceof HTMLImageElement) return imageMap.get(element) ? imageParagraph(imageMap.get(element)!) : "";
    const tag = element.tagName.toLowerCase(); const style = window.getComputedStyle(element);
    const size = tag === "h1" ? 34 : tag === "h2" ? 30 : tag === "h3" ? 26 : 22;
    const prefix = tag === "li" ? "•  " : "";
    return paragraph(`${prefix}${element.textContent?.trim() ?? ""}`, size, tag.startsWith("h") || style.fontWeight === "700", tag.startsWith("h") ? 240 : 140, style.textAlign === "center", cssColor(style.color), cssColor(style.backgroundColor));
  }).join("") : fallbackText.split(/\n+/).filter(Boolean).map((line) => paragraph(cleanMarkdown(line), 22, false, 140)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${paragraph(title, 38, true, 360, true)}${blocks}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

function paragraph(text: string, size: number, bold: boolean, after: number, centered = false, color = "", background = "") {
  return `<w:p><w:pPr>${centered ? '<w:jc w:val="center"/>' : ""}<w:spacing w:line="420" w:lineRule="auto" w:after="${after}"/>${background ? `<w:shd w:fill="${background}"/>` : ""}</w:pPr><w:r><w:rPr>${bold ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:eastAsia="Microsoft YaHei"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function imageParagraph(image: DocxImage) {
  const cx = Math.round(image.width * 9525); const cy = Math.round(image.height * 9525);
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="180" w:after="220"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${image.relationId.replace("rId", "")}" name="文章配图"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${image.fileName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.relationId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function documentRelationships(images: DocxImage[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${images.map((image) => `<Relationship Id="${image.relationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`).join("")}</Relationships>`;
}

function cleanMarkdown(value: string) {
  return value.replace(/!\[[^\]]*]\([^)]*\)/g, "").replace(/\[([^\]]+)]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "").trim();
}

async function collectImages(source: Element) {
  const elements = Array.from(source.querySelectorAll("img"));
  const results = await Promise.all(elements.map(async (image, index): Promise<DocxImage | null> => {
    try {
      const response = await fetch(image.currentSrc || image.src); if (!response.ok) return null;
      const blob = await response.blob(); const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, 560 / bitmap.width); const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height); bitmap.close();
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")); if (!png) return null;
      return { data: new Uint8Array(await png.arrayBuffer()), width, height, relationId: `rId${index + 1}`, fileName: `image-${index + 1}.png`, sourceIndex: index };
    } catch { return null; }
  }));
  return results.filter((image): image is DocxImage => Boolean(image)).map((image, index) => ({ ...image, relationId: `rId${index + 1}`, fileName: `image-${index + 1}.png` }));
}

function cssColor(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match || match[4] === "0") return "";
  return [match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function zip(files: Array<{ name: string; content: string | Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name); const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content; const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length); const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x0800, true); localView.setUint32(14, checksum, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); local.set(name, 30); local.set(data, 30 + name.length); localParts.push(local);
    const central = new Uint8Array(46 + name.length); const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x0800, true); centralView.setUint32(16, checksum, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true); centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true); central.set(name, 46); centralParts.push(central); offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, centralSize, true); view.setUint32(16, offset, true);
  return concat([...localParts, ...centralParts, end]);
}

function concat(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
