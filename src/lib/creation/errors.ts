const DEFAULT_CREATION_ERROR = "这次创作没有完成，可能是生成服务暂时没有正常响应。请稍后重试；如果连续失败，请联系管理员检查模型服务。";

/** Convert infrastructure/model errors into messages a creator can act on. */
export function getCreationUserError(error: unknown, fallback = DEFAULT_CREATION_ERROR) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLowerCase();

  if (!message) return fallback;
  if (/还没有填写|请先|请选择|请上传|确认已经|不可用，请检查/.test(message)) return message;
  if (/大模型服务未配置|api key 未配置|gemini api key 未配置/.test(normalized)) {
    return "现在还没有配置内容生成服务，所以无法完成创作。请联系管理员检查模型 API Key 和服务配置。";
  }
  if (/熔断中/.test(message)) {
    return "内容生成服务近期连续异常，系统暂时暂停了请求，避免继续失败。请稍等几分钟后再试，或联系管理员检查备用模型。";
  }
  if (/abort|timeout|timed out|超时/.test(normalized)) {
    return "这次创作等待生成服务的时间过长，系统已停止等待。通常是服务繁忙或内容较复杂，请稍后重试；也可以先减少输入内容。";
  }
  if (/429|rate.?limit|请求过多|繁忙/.test(normalized)) {
    return "当前生成服务请求较多，暂时没有完成这次创作。请稍等片刻后重试，输入内容不会丢失。";
  }
  if (/大模型服务调用失败|gemini 调用失败|status\s*5\d\d|服务不可用/.test(normalized)) {
    return "生成服务暂时没有正常响应，因此这次创作没有完成。请稍后重试；如果仍然失败，请联系管理员检查模型服务状态。";
  }
  if (/没有返回有效内容|空内容/.test(message)) {
    return "生成服务没有返回可用内容，可能是输入信息不足或服务中途结束。请补充更具体的主题、对象或要求后再试。";
  }
  if (/图片模型未配置/.test(message)) {
    return "现在还没有配置图片生成服务，所以无法生成图片。请联系管理员检查图片模型配置。";
  }
  if (/图片生成失败/.test(message)) return message;
  return message === "内容生成失败" || message === "创建作品失败" ? fallback : message;
}

export const CREATION_NETWORK_ERROR = "没有收到创作服务的回应，可能是网络中断或服务暂时不可用。请检查网络后重试，已填写内容会保留。";
