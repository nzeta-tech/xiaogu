/* 香港本地资讯源：2026-08-23 抓取自香港01、RTHK 本地新闻及 Yahoo 港闻。 */
const xiaoguHongKongLocalSources = [
  [
    '三旋共舞｜紫檀及簡拉維生成　天文台料沙德爾往琉球　遊日需注意',
    '香港01报道，西北太平洋有多个热带气旋活动；天文台预料沙德尔移向琉球一带，赴日旅客需留意天气变化。',
    '香港01 · 热门',
    'https://www.hk01.com/天氣/60382628/三旋共舞-紫檀及簡拉維生成-天文台料沙德爾往琉球-遊日需注意',
    'https://cdn.hk01.com/di/media/images/dw/20260822/1167908712036175872548367.jpeg/sC1s4lDT8wUJrwojrzu3AyZETUoKrubOnOC40JzguNA'
  ],
  [
    '打鼓嶺狗咬死人｜網傳狗義工救狗片　稱「太陽」被鐵鏈綁住失自由',
    '香港01报道打鼓岭狗只袭击致死事件后续：涉事犬只被渔护署带走观察，网络流传义工救援相关片段。',
    '香港01 · 热门',
    'https://www.hk01.com/突發/60382546/打鼓嶺狗咬死人-網傳狗義工救狗片-稱-太陽-被鐵鏈綁住失自由',
    'https://cdn.hk01.com/di/media/images/dw/20260822/1167788419443593216729086.jpeg/jJbkgZ3cUx6cAx_H2DaIa9HPWsqnf-ArJvEasCbxGrA'
  ],
  [
    '新皇崗口岸車輛壓測　李耀培料日後5分鐘過關　市民讚高德導航準',
    '新皇岗口岸启用前进行车辆压力测试，模拟「一地两检」及「五合一」车辆通关模式；报道引述预期通关时间可缩短。',
    '香港01 · 社会新闻',
    'https://www.hk01.com/社會新聞/60382659/新皇崗口岸車輛壓測-李耀培料日後5分鐘過關-市民讚高德導航準',
    'https://cdn.hk01.com/di/media/images/dw/20260822/1167900490944483328083942.jpeg/lcA6hH2HSzPNchj2pjik2AJw9ReAeAM-vVT1D71U9Q8'
  ],
  [
    '天氣｜今日有幾陣驟雨　初時局部地區有雷暴　最高氣溫32度',
    '香港01引述天文台预报：处暑当日大致多云、有骤雨，初时局部地区有雷暴，最高气温约32度。',
    '香港01 · 社会新闻',
    'https://www.hk01.com/天氣/60382718/天氣-今日有幾陣驟雨-初時局部地區有雷暴-最高氣溫32度',
    'https://cdn.hk01.com/di/media/images/dw/20260823/1168081415300976640210758.jpeg/pjk97PU0bvJKKSUJend9WEtY7pS65dbWPVMtrwdTLa8'
  ],
  [
    '入境處：皇崗港方口岸區演練進行客流測試及車流壓力測試',
    'RTHK即时本地新闻报道，入境处在皇岗港方口岸区演练中进行客流及车流压力测试。',
    'RTHK · 本地即时',
    'https://news.rthk.hk/rthk/ch/component/k2/1867147-20260822.htm',
    ''
  ],
  [
    '香港海關順利為「聯合一站式」車道進行壓力測試',
    'RTHK报道，香港海关完成「联合一站式」车道压力测试，为皇岗口岸启用前准备提供进展。',
    'RTHK · 本地即时',
    'https://news.rthk.hk/rthk/ch/component/k2/1867144-20260822.htm',
    ''
  ],
  [
    '陳美寶：將不斷優化皇崗港方口岸區公共運輸交匯處設置安排',
    'RTHK报道，运输及物流局局长陈美宝表示，会持续优化皇岗港方口岸区公共运输交汇处的安排。',
    'RTHK · 本地即时',
    'https://news.rthk.hk/rthk/ch/component/k2/1867141-20260822.htm',
    ''
  ],
  [
    '北大嶼公路早上發生8宗交通意外　涉至少14輛車4人受傷',
    'Yahoo 港闻聚合 Now 新闻报道：北大屿山公路早上发生多宗车辆相撞事故，涉及至少14辆车，4人受伤。',
    'Yahoo 港闻 · Now 新闻',
    'https://hk.news.yahoo.com/%E5%8C%97%E5%A4%A7%E5%B6%BC%E5%85%AC%E8%B7%AF%E6%97%A9%E4%B8%8A%E7%99%BC%E7%94%9F8%E5%AE%97%E4%BA%A4%E9%80%9A%E6%84%8F%E5%A4%96-%E6%B6%89%E8%87%B3%E5%B0%9114%E8%BC%9B%E8%BB%8A4%E4%BA%BA%E5%8F%97%E5%82%B7-055626878.html',
    'https://media.zenfs.com/ko/now_com_news_hk_593/41a337084f48b26130d3fcbaade1076c.jpg'
  ],
  [
    '深水埗唐樓塌棚架　男工人受傷送院',
    'Yahoo 港闻聚合 Now 新闻报道：深水埗南昌街一幢唐楼棚架松脱倒塌，一名男工人头部受伤送院，案件列作工业意外。',
    'Yahoo 港闻 · Now 新闻',
    'https://hk.news.yahoo.com/%E6%B7%B1%E6%B0%B4%E5%9F%97%E5%94%90%E6%A8%93%E5%A1%8C%E6%A3%9A%E6%9E%B6-%E7%94%B7%E5%B7%A5%E4%BA%BA%E5%8F%97%E5%82%B7%E9%80%81%E9%99%A2-101731285.html',
    'https://media.zenfs.com/zh-tw/now_com_news_hk_593/11786942587c9575bdaf67423eaae3ef.jpg'
  ],
  [
    '孫東稱科大牽頭研製的「天韻相機」整體運作表現良好',
    'Yahoo 港闻聚合 Now 新闻报道，科大牵头研制的「天韵相机」已完成在轨装配检测并投入运作。',
    'Yahoo 港闻 · Now 新闻',
    'https://hk.news.yahoo.com/%E5%AD%AB%E6%9D%B1%E7%A8%B1%E7%A7%91%E5%A4%A7%E7%89%BD%E9%A0%AD%E7%A0%94%E8%A3%BD%E7%9A%84-%E5%A4%A9%E9%9F%BB%E7%9B%B8%E6%A9%9F-%E6%95%B4%E9%AB%94%E9%81%8B%E4%BD%9C%E8%A1%A8%E7%8F%BE%E8%89%AF%E5%A5%BD-074026331.html',
    'https://media.zenfs.com/ko/now_com_news_hk_593/b408e38c0018f3c98bddeb1bea34ee36.jpg'
  ]
].map(([title, fact, source, sourceUrl, imageUrl]) => ({
  tab: '香港',
  cat: '社会民生',
  hot: true,
  title,
  source,
  sourceUrl,
  imageUrl,
  fact,
  hook: `「${title}」如何影响在港生活、跨境出行或家庭决策？`,
  angle: '先讲清事实和时间，再用本地生活场景解释影响，不延伸未经证实的推论。',
  action: '用「发生什么—谁会受影响—需要留意什么」三段式表达。',
  risk: '高',
  score: source
}));

window.XIAOGU_RESEARCH_CACHE = window.XIAOGU_RESEARCH_CACHE.flat().concat(xiaoguHongKongLocalSources);
