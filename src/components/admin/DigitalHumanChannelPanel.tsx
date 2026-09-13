"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { SystemSettings } from "@/lib/system/settings";
import { apiPath } from "@/lib/client/url";

type ChannelStatus = { id: "heygen" | "chanjing"; label: string; provider: string; enabled: boolean; configured: boolean };
type Payload = { channels: ChannelStatus[]; storage: { count: number; bytes: string; database_count: number; s3_count: number; local_disk_count:number;local_disk_bytes:string; databaseBytes: string; s3Configured: boolean;localDiskEnabled:boolean;localDiskPath:string;localDiskNodeId:string; maxFileMb: number; warningMb: number } };

function bytes(value: string | number) { const size=Number(value||0); if(size<1024*1024)return `${Math.round(size/1024)} KB`; if(size<1024*1024*1024)return `${(size/1024/1024).toFixed(1)} MB`; return `${(size/1024/1024/1024).toFixed(2)} GB`; }

export function DigitalHumanChannelPanel({ settings, setSettings }: { settings: SystemSettings; setSettings: Dispatch<SetStateAction<SystemSettings>> }) {
  const [payload,setPayload]=useState<Payload|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{fetch(apiPath("/api/admin/digital-human-channels")).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||"渠道状态加载失败");setPayload(body)}).catch(cause=>setError(cause instanceof Error?cause.message:"渠道状态加载失败"))},[]);
  const update=(patch:Partial<SystemSettings["digitalHuman"]>)=>setSettings(current=>({...current,digitalHuman:{...current.digitalHuman,...patch}}));
  return <div className="pageStack">
    <section className="adminPanel"><div className="adminPanelHeader"><div><h2>数字人渠道</h2><p>创作者只看到统一的创建方式，供应商选择、停用和降级由这里控制。</p></div></div>
      <label className="settingsToggle"><span><strong>启用数字人服务</strong><small>关闭后停止新建数字人和提交成片。</small></span><input checked={settings.digitalHuman.enabled} onChange={event=>update({enabled:event.target.checked})} type="checkbox" /></label>
      <div className="tableList">{payload?.channels.map(channel=><div className="tableRow" key={channel.id}><div><strong>{channel.label}</strong><span>实际供应商：{channel.provider} · {channel.configured?"凭证已配置":"凭证未配置"}</span></div><label><input checked={channel.id==="heygen"?settings.digitalHuman.heygenEnabled:settings.digitalHuman.chanjingEnabled} disabled={!channel.configured} onChange={event=>update(channel.id==="heygen"?{heygenEnabled:event.target.checked}:{chanjingEnabled:event.target.checked})} type="checkbox" /> 启用</label></div>)}</div>
      <label className="adminField"><span>优先通道</span><select value={settings.digitalHuman.preferredProvider} onChange={event=>update({preferredProvider:event.target.value as SystemSettings["digitalHuman"]["preferredProvider"]})}><option value="auto">自动选择</option><option value="heygen">快速形象通道优先</option><option value="chanjing">高还原形象通道优先</option></select></label>
      {error?<p className="formError">{error}</p>:null}
    </section>
    <section className="adminPanel"><div className="adminPanelHeader"><div><h2>媒体存储策略</h2><p>优先写入服务器持久磁盘；数据库只用于小文件应急兜底。</p></div></div>
      <div className="adminMetricGrid"><article><span>本地磁盘媒体</span><strong>{bytes(payload?.storage.local_disk_bytes||0)}</strong></article><article><span>数字人媒体</span><strong>{bytes(payload?.storage.bytes||0)}</strong></article><article><span>媒体文件</span><strong>{payload?.storage.count??0}</strong></article><article><span>存储节点</span><strong>{payload?.storage.localDiskNodeId||"未配置"}</strong></article></div>
      <label className="settingsToggle"><span><strong>启用服务器持久磁盘</strong><small>视频文件写入固定媒体目录，数据库仅记录节点和相对路径。</small></span><input checked={settings.digitalHuman.localDiskEnabled} onChange={event=>update({localDiskEnabled:event.target.checked})} type="checkbox" /></label>
      {settings.digitalHuman.localDiskEnabled?<div className="settingsFormGrid"><label className="adminField"><span>媒体目录</span><input value={settings.digitalHuman.localDiskPath} onChange={event=>update({localDiskPath:event.target.value})}/><small>容器部署时可由 DIGITAL_HUMAN_LOCAL_STORAGE_DIR 覆盖。</small></label><label className="adminField"><span>存储节点 ID</span><input value={settings.digitalHuman.localDiskNodeId} onChange={event=>update({localDiskNodeId:event.target.value})}/></label><label className="adminField"><span>单节点策略容量（GB）</span><input max="100000" min="1" type="number" value={settings.digitalHuman.localDiskMaxGb} onChange={event=>update({localDiskMaxGb:Number(event.target.value)})}/></label></div>:null}
      <label className="settingsToggle"><span><strong>允许数据库临时兜底</strong><small>建议仅用于开发环境或短期故障切换。</small></span><input checked={settings.digitalHuman.databaseFallbackEnabled} onChange={event=>update({databaseFallbackEnabled:event.target.checked})} type="checkbox" /></label>
      <div className="settingsFormGrid"><label className="adminField"><span>单文件上限（MB）</span><input max="200" min="1" type="number" value={settings.digitalHuman.databaseMaxFileMb} onChange={event=>update({databaseMaxFileMb:Number(event.target.value)})}/></label><label className="adminField"><span>媒体占用告警（MB）</span><input max="102400" min="100" type="number" value={settings.digitalHuman.databaseWarningMb} onChange={event=>update({databaseWarningMb:Number(event.target.value)})}/></label></div>
      {!payload?.storage.s3Configured&&settings.digitalHuman.localDiskEnabled?<p className="adminNotice">当前使用服务器持久磁盘，不会将大视频写入数据库。请为媒体目录配置独立数据盘和系统快照。</p>:null}
      {Number(payload?.storage.bytes||0)>=settings.digitalHuman.databaseWarningMb*1024*1024?<p className="formError">数字人媒体数据库占用已达到告警阈值，请尽快配置对象存储并迁移历史文件。</p>:null}
    </section>
  </div>;
}
