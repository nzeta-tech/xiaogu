import { createHash, timingSafeEqual } from "node:crypto";

export function verifyEasypaySignature(values: Record<string, string>, key: string) {
  if (!key || !/^[a-f\d]{32}$/i.test(values.sign ?? "")) return false;
  const raw = Object.keys(values).filter(item => item !== "sign" && item !== "sign_type" && values[item] !== "").sort().map(item => `${item}=${values[item]}`).join("&");
  const expected = createHash("md5").update(`${raw}${key}`).digest("hex");
  return timingSafeEqual(Buffer.from(values.sign.toLowerCase()), Buffer.from(expected));
}
