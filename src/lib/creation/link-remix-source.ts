const supportedHosts = /(^|\.)((douyin\.com)|(weixin\.qq\.com)|(channels\.weixin\.qq\.com))$/i;

export function isSupportedLinkRemixUrl(value: string) {
  const rawUrl = value.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? value;
  try {
    const url = new URL(rawUrl.replace(/[，。！？；：、）》】]+$/g, ""));
    return /^https?:$/.test(url.protocol) && supportedHosts.test(url.hostname) && !/^mp\.weixin\.qq\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}
