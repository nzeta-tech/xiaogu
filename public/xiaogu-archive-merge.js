/* 当前热点优先，历史候选仅补足数量；同标题只保留一条。 */
const xiaoguCurrentTopics = window.XIAOGU_RESEARCH_CACHE.flat();
const xiaoguArchiveTopics = (window.XIAOGU_ARCHIVE_TOPICS || [])
  .filter(topic => topic.tab !== '政策')
  .map(topic => ({ ...topic, tab: (topic.tab === '热点' || topic.tab === '实时热点') ? '社会热点' : topic.tab }));
const xiaoguTopicKey = topic => String(topic.title || '').replace(/[\s　·，,。！？!？：:（）()「」『』“”'"-]/g, '').slice(0, 42);
const xiaoguSeenTopics = new Set();
window.XIAOGU_RESEARCH_CACHE = [...xiaoguCurrentTopics, ...xiaoguArchiveTopics]
  .filter(topic => {
    const key = xiaoguTopicKey(topic);
    if (!key || xiaoguSeenTopics.has(key)) return false;
    xiaoguSeenTopics.add(key);
    return true;
  });
