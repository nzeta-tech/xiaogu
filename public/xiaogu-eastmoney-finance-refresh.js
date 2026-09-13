/* 东方财富财经要闻：2026-08-23 抓取自 finance.eastmoney.com/yaowen.html。 */
const xiaoguEastmoneyFinance = [
  [
    '加拿大宣布9月8日起对美国商品征收报复性关税',
    '加拿大总理卡尼表示，9月8日起将对多个行业的美国进口商品征收关税，以回应美国的新关税措施。',
    'https://finance.eastmoney.com/a/202608233850222074.html',
    'https://np-newspic.dfcfw.com/download/D24832322570439903187_w210h154.jpg'
  ],
  [
    '9秒39 中国机器人打破人类百米世界纪录',
    '第二届世界人形机器人运动会百米预赛中，天卓队机器人跑出9秒39，刷新赛会纪录。',
    'https://finance.eastmoney.com/a/202608223850188231.html',
    'https://np-newspic.dfcfw.com/download/D25002021514974316306_w210h154.jpg'
  ],
  [
    '一夜大涨！金饰克价逼近1400元',
    '8月22日，老凤祥、老庙黄金、周生生等品牌足金饰品报价约1387至1391元/克，单日上涨22至34元。',
    'https://finance.eastmoney.com/a/202608223850164947.html',
    'https://np-newspic.dfcfw.com/download/D25632350500572487715_w210h154.jpg'
  ],
  [
    '太罕见！有银行一年期、两年期和三年期存款利率竟均为1.65% 什么信号？',
    '上海松江富明村镇银行调整在售定期存款利率：一年、两年、三年期均为1.65%，起存金额50元。',
    'https://finance.eastmoney.com/a/202608223850178392.html',
    'https://np-newspic.dfcfw.com/download/D24984610569678553205_w210h154.jpg'
  ]
].map(([title, fact, sourceUrl, imageUrl]) => ({
  tab: '财经',
  cat: '家庭理财',
  hot: true,
  title,
  source: '东方财富 · 财经要闻',
  sourceUrl,
  imageUrl,
  fact,
  hook: `「${title}」背后，普通人真正需要读懂的财经信号是什么？`,
  angle: '从政策、市场变化或家庭财务影响切入，不提供具体买卖建议。',
  action: '用「发生了什么—和我有什么关系—普通人怎么看」三段式展开。',
  risk: '高',
  score: '东方财富 · 财经要闻'
}));

window.XIAOGU_RESEARCH_CACHE = window.XIAOGU_RESEARCH_CACHE.flat().concat(xiaoguEastmoneyFinance);
