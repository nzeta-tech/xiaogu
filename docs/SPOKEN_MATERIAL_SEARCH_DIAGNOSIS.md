# 本次素材检索诊断（2026-09-18）

任务：24f9d64b-eed3-44a5-8391-66fe70a30887。

## 原始方式

Codex 为每段写一条英文组合查询。先 Commons 视频，再 Commons 图片，最后 Openverse 图片。Commons 最多取 10 个候选，Openverse 最多取 20 个；没有分页。仅允许 CC0／公有领域，图片宽高均至少 900px，文件上限 45MB。相关性为标题是否含至少一个过滤后的英文关键词；Openverse 还排除标题含 rate/statistics/history/chart/graph/logo/icon 的结果。初次搜索无结果时不自动将长词组拆成短查询。Commons 遇 429 后，该进程对 Commons 熔断 10 分钟。

## 实测

按上次 6 段的原始查询重放，共 18 次 API 请求，全部 HTTP 200。16 次返回空列表；s4 的 Commons 图片返回 1 项（960×720、CC BY-SA 3.0、标题关键词不匹配），视频返回 4 项，均为奥巴马演讲，标题不匹配。因此本轮确实没有通过筛选的候选。

长查询例：`family mortgage repayment calculator savings`、`mortgage interest rate household bills`、`financial risk balance uncertain investment`。

短查询对照：Openverse `mortgage` 返回 count=205，`calculator` 返回 count=240，均带 cc0 参数；Commons `filetype:image mortgage` 返回 totalhits=3977。数字只是搜索候选数量，不代表可用素材数量。对照中的部分 Commons 请求遇到 HTTP 429。

结论：主要问题是组合词太窄、搜索源少、缺少逐步放宽查询策略；硬编码授权和尺寸筛选进一步缩小候选集，标题匹配也不等于视觉语义相关性。不能把“当前策略没有选到素材”解释成“互联网上没有素材”。上次日志只保存截断错误，没有逐项淘汰理由，因此不能事后声称上次每个请求都遇到了相同问题；以上是本轮重放的证据。

## 后续检索改进方向（尚未在本次改动中实现）

为每段准备多个具体画面概念，先搜 1–2 个核心词，无结果再换同义词；使用匹配最终构图的分辨率条件，而非一律双边 900px；在具备署名与授权处理能力后再考虑扩大授权范围；用缩略图与分镜语义判断相关性，而非仅标题字符串；记录空结果、限流、尺寸、授权、相关性各类淘汰原因。合适的知识卡片仍作为最终兜底。
