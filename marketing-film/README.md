# 小谷 AI 品牌宣传片制作包

片名：`你说的每一句，都值得被听见`  
主片：100 秒、16:9、4K 母版（同时导出 9:16 的 30 秒和 15 秒版）

这个目录是可复跑的自动生产包。它把创意固定为可生成、可审阅、可交付的镜头清单：

1. `film-manifest.json`：唯一事实来源，包含旁白、镜头、参考资产和后期叠字。
2. `scripts/xiaogu-brand-film.mjs`：提交 Seedance 异步任务、轮询、下载、技术质检、生成候选预览及 FFmpeg 粗剪。
3. `assets/`：只放拥有商业使用权的品牌与产品素材。

## 视觉规范

- 风格：**都市写实科技广告 × 温暖轻动画精灵**。
- 写实世界占 60%，小谷精灵占 20%，真实产品 UI / 动态图形占 15%，Logo 片尾占 5%。
- 精灵不是儿童角色、不是二次元主画风，也不是赛博游戏角色；她是由小谷 Logo 演化出的成年感品牌精灵。
- 产品页面和网址一律后期合成，绝不要求视频模型生成可读中文文字。

## 前置素材

```text
marketing-film/assets/
  brand/xiaogu-logo.png              # 已由脚本从 public/brand 复制
  characters/xiaogu-fairy.png        # 确认后的精灵设定图（必需后再批量生成）
  characters/broker-hero.png         # 确认后的主角设定图（必需后再批量生成）
  product/*.png                      # 从真实小谷页面取得的 UI 截图
  audio/narration.wav                # 可选；若不走 TTS，则放置此文件
  music/licensed-bed.wav             # 已授权音乐，可选
```

不要放入客户隐私、保单号、未授权肖像或第三方 IP。

## API 配置

在项目根目录 `.env` 添加 `SEEDANCE_API_BASE_URL` 与 `SEEDANCE_API_KEY`。不同供应商的路径和请求体有差异，因此 `SEEDANCE_SUBMIT_PATH` 和 `SEEDANCE_STATUS_PATH` 可覆盖。脚本默认发送：

```json
{
  "model": "seedance-2.0",
  "prompt": "…",
  "duration": 6,
  "aspect_ratio": "16:9",
  "reference_images": ["file-or-url"],
  "metadata": { "shotId": "s01" }
}
```

第一次只运行 `s01` 与 `s02`，确认供应商返回格式和角色形象后再提交全片。

## 命令

```bash
node --env-file=.env scripts/xiaogu-brand-film.mjs preflight
node --env-file=.env scripts/xiaogu-brand-film.mjs prepare
node --env-file=.env scripts/xiaogu-brand-film.mjs submit --shots=s01,s02
node --env-file=.env scripts/xiaogu-brand-film.mjs poll
node --env-file=.env scripts/xiaogu-brand-film.mjs contacts
# 在 marketing-film/renders/selection.json 标记最终 clip 后：
node --env-file=.env scripts/xiaogu-brand-film.mjs assemble
```

`prepare` 不调用外部 API。`submit` 和 `poll` 才会消耗视频额度。`assemble` 只使用本地 FFmpeg。

## 人工参与边界

流程会自动生成候选、下载、检查分辨率与时长，并输出预览联系表。唯一需要品牌方确认的是：从每个镜头候选里选择最终可用版本。确认后，成片拼接、字幕、Logo 与 `https://xiaogu.nzeta.ai` 均由脚本完成。
