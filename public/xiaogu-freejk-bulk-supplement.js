/*
 * Demo 的批量供给层：只读取公开热榜标题、摘要和原始链接。
 * 每个入口最多保留 50 条，随后按标题去重；不补造虚构热点。
 */
(function () {
  const API = 'https://api.freejk.com/shuju/hotlist/';
  const feeds = {
    '社会热点': [
      ['qq-news', '腾讯新闻'], ['sina-news', '新浪新闻'], ['netease-news', '网易新闻'],
      ['toutiao', '今日头条'], ['zhihu', '知乎'], ['thepaper', '澎湃新闻'],
      ['weatheralarm', '天气预警'], ['hupu', '虎扑热议']
    ],
    '财经': [
      ['36kr', '36氪'], ['geekpark', '极客公园'], ['ifanr', '爱范儿'],
      ['ithome', 'IT之家'], ['51cto', '51CTO'], ['smzdm', '什么值得买'],
      ['sspai', '少数派'], ['csdn', 'CSDN']
    ]
  };
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const keyOf = title => clean(title).replace(/[\s　·，,。！？!？：:（）()「」『』“”'"-]/g, '').slice(0, 42);
  const categoryOf = (tab, title) => {
    if (tab === '财经') {
      if (/AI|芯片|机器人|算力|软件|苹果|华为|小米|互联网|科技|模型/i.test(title)) return '科技商业';
      if (/房|车|消费|零售|旅游|品牌/i.test(title)) return '消费观察';
      return '财经市场';
    }
    if (/雨|台风|高温|暴雨|地震|预警|灾/i.test(title)) return '公共安全';
    if (/学校|教育|医院|医疗|养老|社保|生育/i.test(title)) return '社会民生';
    if (/AI|机器人|科技|手机|汽车|互联网/i.test(title)) return '科技商业';
    return '社会民生';
  };
  const factOf = (source, item) => clean(item.desc || item.summary || '') || `${source} 当前公开热榜收录，适合从事实、影响和普通人关系三个层次切入。`;
  const append = entries => {
    const existing = new Set((window.XIAOGU_RESEARCH_CACHE || []).flat().map(item => keyOf(item.title)));
    entries.forEach(topic => {
      const key = keyOf(topic.title);
      if (!key || existing.has(key)) return;
      existing.add(key);
      window.XIAOGU_RESEARCH_CACHE.push([topic]);
    });
  };
  window.XIAOGU_BULK_TOPICS_READY = Promise.allSettled(
    Object.entries(feeds).flatMap(([tab, sourceList]) => sourceList.map(async ([key, source]) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      let response;
      try {
        response = await fetch(API + key, { cache: 'no-store', signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) return [];
      const payload = await response.json();
      if (payload.code !== 200 || !Array.isArray(payload.data)) return [];
      return payload.data.slice(0, 50).map((item, index) => {
        const title = clean(item.title);
        if (!title) return null;
        const originalUrl = clean(item.url || item.mobileUrl || '');
        return {
          tab,
          title,
          cat: categoryOf(tab, title),
          source: `FreeJK · ${source}`,
          sourceUrl: originalUrl || `https://api.freejk.com/shuju/hotlist/${key}`,
          fact: factOf(source, item),
          score: index < 8 ? '高热' : '热议',
          hot: index < 5,
          hook: `这条 ${source} 热榜，普通人真正该关注什么？`,
          angle: '用“发生了什么—影响谁—下一步怎么看”三段式讲清楚。',
          action: '提炼一个事实、一个反常识点和一个可讨论的问题，直接生成短视频或图文开头。'
        };
      }).filter(Boolean);
    }))
  ).then(results => append(results.flatMap(result => result.status === 'fulfilled' ? result.value : [])));
})();
