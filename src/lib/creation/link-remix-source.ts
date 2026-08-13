const supportedHosts = /(^|\.)((douyin\.com)|(weixin\.qq\.com)|(channels\.weixin\.qq\.com))$/i;

function parseSharedUrl(value: string) {
  const rawUrl = value.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? value;
  return new URL(rawUrl.replace(/[，。！？；：、）》】]+$/g, ""));
}

export function isWechatArticleUrl(value: string) {
  try {
    const url = parseSharedUrl(value);
    return url.protocol === "https:"
      && /^mp\.weixin\.qq\.com$/i.test(url.hostname)
      && (url.pathname === "/s" || url.pathname.startsWith("/s/"));
  } catch {
    return false;
  }
}

export function isSupportedLinkRemixUrl(value: string) {
  try {
    const url = parseSharedUrl(value);
    if (!/^https?:$/.test(url.protocol) || !supportedHosts.test(url.hostname)) return false;
    return !/^mp\.weixin\.qq\.com$/i.test(url.hostname) || isWechatArticleUrl(url.toString());
  } catch {
    return false;
  }
}
