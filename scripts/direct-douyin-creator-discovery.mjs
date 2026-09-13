/**
 * Emergency/seed collector for the persisted Docker Douyin browser. It does
 * not call TikHub: it reads the publicly rendered "用户" search cards and
 * upserts only non-institutional insurance creators with >= 10k followers.
 *
 * Run inside the app container, for example:
 *   node /tmp/direct-douyin-creator-discovery.mjs
 */
import pg from "pg";

const { Pool } = pg;
const queries = (process.env.DOUYIN_CREATOR_DISCOVERY_QUERIES ?? [
  "保险经纪人", "保险理赔律师", "保险理赔", "重疾险", "医疗险", "健康告知",
  "寿险规划", "养老规划", "年金险", "家庭保障", "保单整理", "保险科普",
].join(","))
  .split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean).slice(0, 40);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await fetch("http://127.0.0.1:9224/json/list").then((response) => response.json());
const target = targets.find((item) => item.type === "page");
if (!target?.webSocketDebuggerUrl) throw new Error("douyin_cdp_page_unavailable");
const socket = new WebSocket(target.webSocketDebuggerUrl);
let sequence = 0;

function command(method, params) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const handler = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener("message", handler);
      resolve(message.result);
    };
    socket.addEventListener("message", handler);
  });
}

function parseCard(card) {
  const text = String(card.text ?? "");
  const displayName = text.split(/\n+/)[0]?.trim();
  const creatorKey = String(card.href ?? "").match(/\/user\/(MS4[^?&#/]+)/)?.[1];
  const followerMatch = text.match(/(\d+(?:\.\d+)?)万粉丝/);
  const followerCount = followerMatch ? Math.round(Number(followerMatch[1]) * 10_000) : 0;
  const verified = text.includes("认证徽章");
  const bio = text.split(/抖音号:[^\n]+/).slice(1).join(" ").replace(/\s+/g, " ").trim().slice(0, 1000);
  const insuranceRelevant = /保险|理赔|保单|核保|重疾|医疗险|寿险|年金|经纪|保障/.test(`${displayName} ${bio}`);
  const institution = /(?:有限公司|股份有限公司|保险集团|保险经纪有限公司|保险代理有限公司|人寿保险|财产保险|官方账号|保险商城|保险专卖店|保险官方|官方旗舰|中国人寿|中国平安|中国人保|泰康|蚂蚁保|多保鱼)/.test(`${displayName} ${text}`);
  if (!displayName || !creatorKey || institution || !insuranceRelevant || followerCount < 10_000) return null;
  const professionalScore = /律师|经纪人|MDRT|理赔|核保|规划|科普|保险/.test(`${displayName} ${bio}`) ? 85 : 65;
  const qualityScore = Math.min(100, Math.round(45 + Math.min(30, Math.log10(followerCount + 1) * 5) + (verified ? 15 : 0) + (professionalScore >= 85 ? 10 : 0)));
  return { displayName, creatorKey, profileUrl: String(card.href).split("?")[0], followerCount, verified, bio, professionalScore, qualityScore };
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let observed = 0;
let accepted = 0;

try {
  for (const query of queries) {
    await command("Page.navigate", { url: `https://www.douyin.com/search/${encodeURIComponent(query)}?type=user` });
    await sleep(3000);
    await command("Runtime.evaluate", { expression: `(()=>{const input=document.querySelector('input[placeholder*="搜索"]');if(!input)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(input,${JSON.stringify(query)});input.dispatchEvent(new InputEvent('input',{bubbles:true,data:${JSON.stringify(query)},inputType:'insertText'}));input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',code:'Enter',keyCode:13,which:13}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter',keyCode:13,which:13}));return true})()`, returnByValue: true });
    await sleep(3500);
    await command("Runtime.evaluate", { expression: "[...document.querySelectorAll('span,div')].find((element) => element.children.length === 0 && element.textContent?.trim() === '用户')?.click()", returnByValue: true });
    await sleep(5500);
    // The first viewport contains only a small, highly repetitive top set.
    // Scroll to load subsequent creator cards before taking the DOM snapshot.
    for (let page = 0; page < 3; page += 1) {
      await command("Runtime.evaluate", { expression: "window.scrollBy(0, Math.max(window.innerHeight * 2, 1200)); true", returnByValue: true });
      await sleep(1500);
    }
    const response = await command("Runtime.evaluate", { expression: "JSON.stringify([...document.querySelectorAll('a[href*=\"/user/MS4\"]')].map((a) => ({href:a.href,text:a.innerText})).filter((x) => x.text.includes('抖音号:')).slice(0,50))", returnByValue: true });
    let cards = [];
    try { cards = JSON.parse(response?.result?.value ?? "[]"); } catch { cards = []; }
    observed += cards.length;
    for (const card of cards) {
      const creator = parseCard(card);
      if (!creator) continue;
      const metadata = JSON.stringify({ directDomDiscovery: true, discoveryQuery: query });
      const updated = await pool.query(
        `update viral_creators set display_name=$2, profile_url=$3, bio=case when $4<>'' then $4 else bio end,
           relevance_score=greatest(relevance_score,$5), quality_score=greatest(quality_score,$6),
           follower_count=greatest(coalesce(follower_count,0),$7), is_verified=(is_verified or $8),
           discovery_query=$9, last_discovered_at=now(), updated_at=now(), metadata=metadata || $10::jsonb,
           creator_type='personal', vertical_score=greatest(vertical_score,$5), professional_score=greatest(professional_score,$11)
         where platform='抖音' and platform_creator_key=$1`,
        [creator.creatorKey, creator.displayName, creator.profileUrl, creator.bio, 90, creator.qualityScore, creator.followerCount, creator.verified, query, metadata, creator.professionalScore],
      );
      if (!updated.rowCount) {
        await pool.query(
          `insert into viral_creators
            (platform,creator_key,platform_creator_key,display_name,profile_url,bio,status,relevance_score,quality_score,follower_count,is_verified,source_kind,discovery_query,refresh_status,metadata,pool_status,creator_type,vertical_score,professional_score)
           values ('抖音',$1,$1,$2,$3,$4,'paused',$5,$6,$7,$8,'platform_search',$9,'pending',$10::jsonb,'candidate','personal',$5,$11)
           on conflict (platform,creator_key) do update set
             profile_url=excluded.profile_url, bio=case when excluded.bio<>'' then excluded.bio else viral_creators.bio end,
             relevance_score=greatest(viral_creators.relevance_score,excluded.relevance_score),
             quality_score=greatest(viral_creators.quality_score,excluded.quality_score),
             follower_count=greatest(coalesce(viral_creators.follower_count,0),excluded.follower_count),
             is_verified=(viral_creators.is_verified or excluded.is_verified), last_discovered_at=now(), updated_at=now(),
             metadata=viral_creators.metadata || excluded.metadata`,
          [creator.creatorKey, creator.displayName, creator.profileUrl, creator.bio, 90, creator.qualityScore, creator.followerCount, creator.verified, query, metadata, creator.professionalScore],
        );
      }
      accepted += 1;
    }
  }
} finally {
  socket.close();
  await pool.end();
}

console.log(JSON.stringify({ queries: queries.length, observed, accepted }));
