"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { DigitalHumanRecordingGuide } from "@/components/pages/ProfilePageClient";
import { appPath } from "@/lib/client/url";
import type { DigitalHumanProvider } from "@/lib/digital-human/types";

const guides = {
  heygen: { title:"照片数字人准备方法",summary:"用一张清晰正面照片快速创建人物身份，创建后还可增加同一人物的其他造型。",requirements:["单人正面、眼睛和嘴部无遮挡","光线均匀，避免强逆光和重度美颜","建议半身或胸部以上构图，背景简洁","JPG、PNG 或 WebP，避免使用多人合照"],steps:["准备清晰正面照","上传并确认授权","等待形象处理","就绪后可增加造型或生成视频"],url:"",videoUrl:"",linkLabel:"" },
  chanjing: { title:"高还原数字人拍摄方法",summary:"录制稳定、连续的真人口播素材，可按需训练形象、声音和背景移除能力。",requirements:["单人正面出镜，头肩完整且无遮挡","相机固定，避免频繁转身和大幅动作","环境安静、收音清楚，保持自然语速","MP4、MOV 或 WebM，最长 5 分钟；4K 创建请使用 4K 素材"],steps:["录制清晰连续的真人口播","上传并选择训练能力","确认形象与声音授权","等待形象和可选声音训练完成"],url:"",videoUrl:"",linkLabel:"" },
} satisfies Record<DigitalHumanProvider,{title:string;summary:string;requirements:string[];steps:string[];url:string;videoUrl:string;linkLabel:string}>;

export default function DigitalHumanGuidePage(){
  const [provider,setProvider]=useState<DigitalHumanProvider>("chanjing");
  return <AuthGuard><AppShell><main className="digitalHumanGuidePage"><header><div><span>小谷创作者指南</span><h1>数字人创建指南</h1><p>先按创建方式准备合格素材，再回到数字人资产页提交；教程与创建表单相互独立，查阅更完整。</p></div><a href={appPath("/avatar")}>返回创建数字人</a></header><nav aria-label="选择创建方式"><button className={provider==="chanjing"?"active":""} onClick={()=>setProvider("chanjing")} type="button"><strong>视频高还原</strong><span>适合训练本人形象与可选声音</span></button><button className={provider==="heygen"?"active":""} onClick={()=>setProvider("heygen")} type="button"><strong>上传照片创建</strong><span>适合快速建立身份与多造型</span></button></nav><DigitalHumanRecordingGuide provider={provider} tutorial={guides[provider]} /><section className="digitalHumanGuideBoundary"><strong>能力说明</strong><p>文字生成人像和一次性视频换口播不是同一种可复用数字人资产，因此不会混入这里的创建步骤。平台能力变化时，小谷会按实际可用能力动态显示选项。</p></section></main></AppShell></AuthGuard>;
}
