/* 小谷热点供给源池：用于后续按 Tab 批量抓取、去重与扩容。 */
window.XIAOGU_SOURCE_POOL = {
  '社会热点': [
    ['百度实时热榜', 'https://top.baidu.com/board?tab=realtime'],
    ['微博热搜', 'https://s.weibo.com/top/summary'],
    ['知乎热榜', 'https://www.zhihu.com/hot'],
    ['抖音热点', 'https://www.douyin.com/hot'],
    ['TopHub', 'https://tophub.today/'],
    ['Rebang', 'https://rebang.today/'],
    ['DailyHot', 'https://dailyhot.cc/'],
    ['FreeJK', 'https://api.freejk.com/'],
    ['澎湃新闻', 'https://www.thepaper.cn/'],
    ['今日头条', 'https://www.toutiao.com/'],
    ['哔哩哔哩热搜', 'https://s1.hdslb.com/bfs/static/jinkela/long/images/b-hot.png']
  ],
  '财经': [
    ['金十数据', 'https://www.jin10.com/'],
    ['证券时报金融', 'https://www.stcn.com/article/list/finance.html'],
    ['东方财富财经要闻', 'https://finance.eastmoney.com/yaowen.html'],
    ['Yahoo 财经', 'https://hk.news.yahoo.com/business/'],
    ['RTHK 财经', 'https://news.rthk.hk/rthk/ch/latest-news/finance.htm'],
    ['财联社', 'https://www.cls.cn/telegraph'],
    ['华尔街见闻', 'https://wallstreetcn.com/'],
    ['雪球', 'https://xueqiu.com/'],
    ['第一财经', 'https://www.yicai.com/'],
    ['每日经济新闻', 'https://www.nbd.com.cn/'],
    ['中国证券报', 'https://www.cs.com.cn/']
  ],
  '香港': [
    ['香港01 热门', 'https://www.hk01.com/hot'],
    ['香港01 社会新闻', 'https://www.hk01.com/channel/2/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E'],
    ['RTHK 本地即时', 'https://news.rthk.hk/rthk/ch/latest-news/local.htm'],
    ['Yahoo 港闻', 'https://hk.news.yahoo.com/hong-kong/'],
    ['香港政府新闻处', 'https://www.news.gov.hk/'],
    ['香港金融管理局', 'https://www.hkma.gov.hk/'],
    ['SCMP', 'https://www.scmp.com/'],
    ['香港经济日报', 'https://www.hket.com/'],
    ['明报', 'https://news.mingpao.com/'],
    ['星岛头条', 'https://www.stheadline.com/']
  ],
  '国际': [
    ['RTHK 国际即时', 'https://news.rthk.hk/rthk/ch/latest-news/world-news.htm'],
    ['Reuters', 'https://www.reuters.com/world/'],
    ['Associated Press', 'https://apnews.com/world-news'],
    ['BBC News', 'https://www.bbc.com/news/world'],
    ['Financial Times', 'https://www.ft.com/world'],
    ['联合早报国际', 'https://www.zaobao.com.sg/realtime/world'],
    ['DW 中文', 'https://www.dw.com/zh/'],
    ['IMF', 'https://www.imf.org/en/News'],
    ['World Bank', 'https://www.worldbank.org/en/news'],
    ['WHO', 'https://www.who.int/news'],
    ['Fed', 'https://www.federalreserve.gov/newsevents.htm'],
    ['ECB', 'https://www.ecb.europa.eu/press/html/index.en.html']
  ]
};
