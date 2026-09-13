/* 证券时报金融频道：2026-08-23 抓取自 stcn.com/article/list/finance.html。 */
const xiaoguStcnFinance = [
  ['交易所出手！十余组账户被处罚，涉及这些违规行为','8月10日至21日，多家期货交易所密集发布监管措施公告，重点查处账户超限开仓、关联账户对敲转移资金等违规行为。','https://www.stcn.com/article/detail/4102621.html','https://static-web.stcn.com/upload/wechat/20260822/6a8973db08ace.png?x-oss-process=image/resize,m_fill,h_116,w_150'],
  ['长存控股来了！金融机构股东图谱浮现：银行系扎堆，多家券商隐现','长江存储控股科创板IPO申报材料获受理，公开材料显示多家银行、券商及保险机构通过投资平台参与。','https://www.stcn.com/article/detail/4102604.html','https://static-web.stcn.com/upload/wechat/20260822/6a8985407a619.png?x-oss-process=image/resize,m_fill,h_116,w_150'],
  ['工行、农行、中行、建行、交行、邮储银行等，集体发布','六家国有银行相继发布个人消费贷款及信用卡分期财政贴息政策客户问答，单人年度累计贴息上限由3000元提高至5000元。','https://www.stcn.com/article/detail/4102546.html','https://static-web.stcn.com/upload/wechat/20260822/6a89569178db0.png?x-oss-process=image/resize,m_fill,h_116,w_150'],
  ['中泰证券出手回购！','中泰证券公告称，拟以自有资金1亿元至2亿元回购部分A股股份，回购股份将用于减少注册资本。','https://www.stcn.com/article/detail/4102543.html','https://static-web.stcn.com/upload/wechat/20260822/6a8956a19a396.png?x-oss-process=image/resize,m_fill,h_116,w_150'],
  ['多重因素影响美债市场，公募最新观点来了','近期长端美债收益率快速攀升；美国财政部宣布扩大长期国债流动性支持回购规模，多家基金公司解读市场波动。','https://www.stcn.com/article/detail/4102530.html','https://static-web.stcn.com/upload/wechat/20260822/6a892c03f15f1.png?x-oss-process=image/resize,m_fill,h_116,w_150'],
  ['东方财富，大赚超80亿元！13家券商，中考成绩出炉','多家券商披露半年报；报道提及东方财富上半年归母净利润80.64亿元，同比增长44.85%。','https://www.stcn.com/article/detail/4102462.html','https://static-web.stcn.com/upload/wechat/20260822/6a891fd80e7fa.png?x-oss-process=image/resize,m_fill,h_116,w_150']
].map(([title,fact,sourceUrl,imageUrl])=>({tab:'财经',cat:'家庭理财',hot:true,title,source:'证券时报 · 金融',sourceUrl,imageUrl,fact,hook:`「${title}」背后，普通人真正需要读懂的财经信号是什么？`,angle:'从政策、市场变化或家庭财务影响切入，不提供具体买卖建议。',action:'用「发生了什么—和我有什么关系—普通人怎么看」三段式展开。',risk:'高',score:'证券时报 · 最新金融'}));
window.XIAOGU_RESEARCH_CACHE = window.XIAOGU_RESEARCH_CACHE.flat().concat(xiaoguStcnFinance);
