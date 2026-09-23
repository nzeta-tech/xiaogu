"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { appPath } from "@/lib/client/url";

export default function DigitalHumanGuidePage() {
  return <AuthGuard><AppShell><main className="digitalHumanGuidePage">
    <header><div><span>小谷创作者指南</span><h1>口播照片与声音准备</h1><p>准备照片和声音后，即可前往口播视频生成填写文案。</p></div><a href={appPath("/avatar?tab=visual&asset=digital-humans")}>前往口播资产</a></header>
    <section><h2>准备口播照片</h2><p>上传本人或已获授权的单人照片，也可以从照片模板库选择。建议使用清晰正面半身照，保持光线均匀、眼睛和嘴部无遮挡。支持 JPG、PNG、WebP，大小不超过 15 MB。</p></section>
    <section><h2>准备口播声音</h2><p>在“我的声音库”中录制自己的声音。录音时请在安静环境中自然朗读页面文稿，声音准备完成后即可用于视频。</p></section>
    <section><h2>生成口播视频</h2><p>选择已保存的照片与可用声音，填写标题和文案后提交。旧版视频训练数字人及禅境视频生成功能已下线，已有照片和历史作品继续保留。</p></section>
  </main></AppShell></AuthGuard>;
}
