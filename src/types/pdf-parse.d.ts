declare module "pdf-parse" {
  type PdfParseResult = { text: string; numpages: number; info?: Record<string, unknown> };
  export default function parse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParseResult = { text: string; numpages: number; info?: Record<string, unknown> };
  export default function parse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
}
