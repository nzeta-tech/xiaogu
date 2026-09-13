/* 在当天刷新覆盖前保留已验证过的历史候选，用于补充灵感池而不重复当前条目。 */
window.XIAOGU_ARCHIVE_TOPICS = Array.isArray(window.XIAOGU_RESEARCH_CACHE)
  ? window.XIAOGU_RESEARCH_CACHE.flat()
  : [];
