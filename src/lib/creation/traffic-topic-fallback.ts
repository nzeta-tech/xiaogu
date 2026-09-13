import { parseTrafficTopicArena } from "./traffic-topic-arena.ts";

export function fallbackFastTopics(source:string) {
  const focus=extractFallbackFocus(source);
  const priorAngles=[...source.matchAll(/^#{2,3}\s+(?:\d+[.、]\s*)?(.{4,70})$/gm)]
    .map((match)=>match[1].replace(/\*\*/g,"").trim())
    .filter((title)=>!/(参考来源|标题备选|正文核心句)/.test(title));
  const inherited=[...new Set(priorAngles)].slice(-5);
  const generic=[
    `${focus}为什么让很多人一边上头，一边不舒服？`,
    `${focus}里，真正值得讨论的成长是什么？`,
    `看${focus}：关系失去边界时会发生什么？`,
    `${focus}讲透了成年人最难面对的哪种选择？`,
    `${focus}之后，我们应该重新理解什么？`,
  ];
  const titles=Array.from({length:5},(_,index)=>inherited[index]||generic[index]);
  const frames=[
    ...titles.map((title,index)=>[index===0?"首选角度":"观点角度",title,"承接已有素材中的具体人物、冲突与观点，不凭空更换主题"]),
    ["定位保送",`${focus}：成年人真正需要守住的，是选择权`,"从创作者长期定位连接到边界、决策与长期生活"],
  ];
  return parseTrafficTopicArena(JSON.stringify({topics:frames.map(([badge,title,thesis],index)=>({title,audience:"关心这一事件及其现实影响的人",humanTension:"信息不足时既怕错过，也怕做错",coreQuestion:title,workingThesis:thesis,hookPromise:"把具体素材拆成一个可以判断的问题",recommendationReason:"承接已有素材，并提供正文可继续兑现的问题",selectionRole:index===5?"positioning_wildcard":"arena",creatorFit:index===5?"medium":"none",score:85-index,badge}) )}),6);
}

function extractFallbackFocus(source:string) {
  const titled=[...source.matchAll(/《([^》]{2,30})》/g)].map((match)=>`《${match[1]}》`);
  if(titled.length)return titled.at(-1)!;
  const labeled=source.match(/(?:当前承接主题|热点标题|标题)[：:]?\s*([^\n]{2,60})/)?.[1]?.trim();
  if(labeled)return labeled;
  const materialLine=source.split(/\n/).map((line)=>line.trim()).find((line)=>line&&!/^(?:【|用户|小谷|补充资料|已有版本|本轮|基于|请|生成)/.test(line));
  return materialLine?.slice(0,40)||"这个主题";
}
