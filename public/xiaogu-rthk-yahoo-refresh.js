/* Yahoo 财经、RTHK 财经及 RTHK 国际：2026-08-23 抓取。 */
const xiaoguFinanceSourceRefresh = [
  [
    'Axios：周五晚間約1600萬桶原油經霍爾木茲海峽運出',
    'Yahoo 财经转载彭博报道：Axios引述美国官员称，周五夜间约1600万桶原油经霍尔木兹海峡南部航道运出。',
    'Yahoo 财经 · 彭博',
    'https://hk.finance.yahoo.com/news/axios-%E5%91%A8%E4%BA%94%E6%99%9A%E9%96%93%E7%B4%841600%E8%90%AC%E6%A1%B6%E5%8E%9F%E6%B2%B9%E7%B6%93%E9%9C%8D%E7%88%BE%E6%9C%A8%E8%8C%B2%E6%B5%B7%E5%B3%BD%E9%81%8B%E5%87%BA-142642703.html',
    'https://media.zenfs.com/zh-tw/bloomberg_chinese_traditional_757/225220dac752de9b55fb41a83b7477e8.jpg'
  ],
  [
    'OpenAI大砍GPT-5.6 Sol價格逾20%！正面迎戰Anthropic與中國AI',
    'Yahoo 财经报道，OpenAI宣布未来3个月下调 GPT-5.6 Sol API 价格逾20%，输入和输出 Token 价格同步下调。',
    'Yahoo 财经 · 钜亨网',
    'https://hk.finance.yahoo.com/news/openai%E5%A4%A7%E7%A0%8Dgpt-5-6-sol%E5%83%B9%E6%A0%BC%E9%80%BE20-%E6%AD%A3%E9%9D%A2%E8%BF%8E%E6%88%B0anthropic%E8%88%87%E4%B8%AD%E5%9C%8Bai-131134399.html',
    'https://media.zenfs.com/no/cnyes_hk_559/cc33c9b7428ecdd674602e1a3dea1225.jpg'
  ],
  [
    '新盤票王｜逾4.7萬票西南九龍叡璟I 首輪即日沽清',
    'Yahoo 财经报道，西南九龙叡璟I 首轮销售前录得逾4.7万票认购，并于当日售罄。',
    'Yahoo 财经 · BossMind',
    'https://hk.finance.yahoo.com/news/%E6%96%B0%E7%9B%A4%E7%A5%A8%E7%8E%8B-%E9%80%BE4-7%E8%90%AC%E7%A5%A8%E8%A5%BF%E5%8D%97%E4%B9%9D%E9%BE%8D%E5%8F%A1%E7%92%9Fi-%E9%A6%96%E8%BC%AA%E5%8D%B3%E6%97%A5%E6%B2%BD%E6%B8%85-121400351.html',
    'https://media.zenfs.com/ko/bossmind_356/4ae71f29ca3549cfa318d3fdafacc359.png'
  ],
  [
    '美元兌歐元觸及3個月低位　美債孳息率繼續上升',
    'RTHK 财经即时新闻报道，美元兑欧元触及3个月低位，美国国债收益率继续上升。',
    'RTHK · 财经即时',
    'https://news.rthk.hk/rthk/ch/component/k2/1867075-20260822.htm',
    ''
  ],
  [
    '期油價格上升　市場憂慮供應趨緊',
    'RTHK 财经即时新闻报道，期油价格上升，市场忧虑供应趋紧。',
    'RTHK · 财经即时',
    'https://news.rthk.hk/rthk/ch/component/k2/1867072-20260822.htm',
    ''
  ],
  [
    '長江存儲IPO獲受理　或成為科創板歷來第3大新股',
    'RTHK 财经即时新闻报道，长江存储 IPO 获受理，报道指其或成为科创板历来第三大新股。',
    'RTHK · 财经即时',
    'https://news.rthk.hk/rthk/ch/component/k2/1867060-20260821.htm',
    ''
  ]
].map(([title, fact, source, sourceUrl, imageUrl]) => ({
  tab: '财经', cat: '家庭理财', hot: true, title, source, sourceUrl, imageUrl, fact,
  hook: `「${title}」背后，普通人真正需要读懂的财经信号是什么？`,
  angle: '从政策、市场变化或家庭财务影响切入，不提供具体买卖建议。',
  action: '用「发生了什么—和我有什么关系—普通人怎么看」三段式展开。', risk: '高', score: source
}));

const xiaoguRetiredXueqiuTitles = new Set([
  '牧原股份业绩下滑，净利润大跌', '航运概念拉升，凤凰航运涨停', '电网设备板块拉升，正泰电器涨停',
  '农业板块集体走弱，农发种业跌停', '赛力斯2026年半年报：营收574.93亿元', '国电电力启动收购大股东资产，水电火电齐发力'
]);
const xiaoguCacheBeforeRthkYahoo = window.XIAOGU_RESEARCH_CACHE.flat();
window.XIAOGU_RESEARCH_CACHE = xiaoguCacheBeforeRthkYahoo
  .filter(topic => !xiaoguRetiredXueqiuTitles.has(topic.title))
  .concat(xiaoguFinanceSourceRefresh);

const xiaoguRthkInternational = [
  ['日本茨城縣5.9級地震　埼玉市2人受傷', 'RTHK国际即时新闻报道，日本茨城县发生5.9级地震，埼玉市有2人受伤。', 'https://news.rthk.hk/rthk/ch/component/k2/1867154-20260823.htm'],
  ['泰國南部三府發生爆炸縱火事件　那拉提瓦府實施宵禁', 'RTHK国际即时新闻报道，泰国南部三府发生爆炸及纵火事件，那拉提瓦府实施宵禁。', 'https://news.rthk.hk/rthk/ch/component/k2/1867153-20260823.htm'],
  ['英國發生交通事故造成7人死亡　包括2名執勤警員', 'RTHK国际即时新闻报道，英国发生交通事故，造成7人死亡，包括2名执勤警员。', 'https://news.rthk.hk/rthk/ch/component/k2/1867152-20260823.htm'],
  ['加拿大宣布對美國實施等額報復關稅　下月8日生效', 'RTHK国际即时新闻报道，加拿大宣布对美国实施等额报复关税，下月8日生效。', 'https://news.rthk.hk/rthk/ch/component/k2/1867151-20260823.htm'],
  ['日本茨城縣南部發生5.9級地震　東京震感明顯', 'RTHK国际即时新闻报道，日本茨城县南部发生5.9级地震，东京震感明显。', 'https://news.rthk.hk/rthk/ch/component/k2/1867150-20260823.htm'],
  ['普京稱俄軍加大對烏克蘭企業打擊　回應俄羅斯設施遭襲', 'RTHK国际即时新闻报道，普京称俄军加大对乌克兰企业的打击，以回应俄罗斯设施遇袭。', 'https://news.rthk.hk/rthk/ch/component/k2/1867149-20260823.htm'],
  ['澤連斯基稱法國同意向烏克蘭提供導彈生產許可', 'RTHK国际即时新闻报道，泽连斯基称法国同意向乌克兰提供导弹生产许可。', 'https://news.rthk.hk/rthk/ch/component/k2/1867148-20260823.htm'],
  ['美國8月服務業PMI創逾1年半新高', 'RTHK国际即时新闻报道，美国8月服务业 PMI 创逾一年半新高。', 'https://news.rthk.hk/rthk/ch/component/k2/1867063-20260821.htm'],
  ['美股道指升近1%收市　本周3大指數下跌', 'RTHK国际即时新闻报道，美股道琼斯指数升近1%收市，但本周三大指数下跌。', 'https://news.rthk.hk/rthk/ch/component/k2/1867073-20260822.htm'],
  ['紐約期金高收逾2%', 'RTHK国际即时新闻报道，纽约期金高收逾2%。', 'https://news.rthk.hk/rthk/ch/component/k2/1867071-20260822.htm']
].map(([title, fact, sourceUrl]) => ({
  tab: '国际', cat: '国际观察', hot: true, title, source: 'RTHK · 国际即时', sourceUrl, imageUrl: '', fact,
  hook: `「${title}」会如何传导到市场、出行或普通人的日常？`,
  angle: '用具体事件说明变化，不夸大不确定影响。',
  action: '先讲事实，再解释与中国家庭或全球市场的连接。', risk: '高', score: 'RTHK · 国际即时'
}));

window.XIAOGU_RESEARCH_CACHE = window.XIAOGU_RESEARCH_CACHE.flat().concat(xiaoguRthkInternational);
