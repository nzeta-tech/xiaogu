/* 直连百度实时热榜：2026-08-23 抓取自 top.baidu.com/board?tab=realtime。 */
const xiaoguBaiduRealtime = [
  ['人民日报：处置甲醛白菜必须从速从严','8月22日河北张家口康保县通报，部分大白菜装车前蘸甲醛溶液保鲜属实，已采取措施并追溯流向。','食品安全与家庭餐桌如何建立“购买—留证—反馈”习惯？','高','https://fyb-2.cdn.bcebos.com/hotboard_image/370e157803f3e9f29ad5f8e99f0f119c'],
  ['住破房穿20块衣服男子20年攒789万','热榜报道提及，浙江嘉兴一男子积攒的789万元在6天内被骗走。','从“攒钱能力”到“资金安全”，讲家庭防诈的最后一道防线。','高','https://fyb-2.cdn.bcebos.com/hotboard_image/b934254b9b508183a0baa30345181723'],
  ['具身智能机器人正加速迈向应用','2026世界机器人大会正在北京亦庄举办，相关报道聚焦机器人从展示走向落地应用。','从“机器人会不会替代我”切入普通人的职业与家庭准备。','中','https://fyb-2.cdn.bcebos.com/hotboard_image/a6b9c4d2711099b181b7d359c10f03f6'],
  ['总犯困、代谢慢？可能不是上班累的','热榜报道引用调研称，超过42%居民每日优质蛋白摄入占比未达40%。','从忙碌家庭的饮食误区切入，不把健康焦虑变成恐慌。','中','https://fyb-2.cdn.bcebos.com/hotboard_image/6cc30bcc0e41ffb3c4f12450aa91034a'],
  ['宇树机器人100米预赛小组垫底','第二届世界人形机器人运动会中，多支机器人队伍参加100米大型组预赛，引发技术能力讨论。','用“看见进步，也允许失败”讲科技热潮中的真实成长。','低','https://fyb-2.cdn.bcebos.com/hotboard_image/33c49a6a66c3e4f4121597f9bd51ef80'],
  ['女主播被控诈骗2500万元','热榜信息称，一起涉及直播打赏与虚构人设的案件仍在审理，金额引发讨论。','从情感消费、网络打赏和家庭资金边界切入，避免复述未定论细节。','高','https://fyb-2.cdn.bcebos.com/hotboard_image/865bdfa9df034fd0341ef8850af3e3b3'],
  ['今年第20号台风简拉维生成','热榜信息显示，第20号台风“简拉维”于8月22日在西北太平洋洋面生成。','从出行计划、家庭应急包和重要资料备份切入。','中','https://fyb-2.cdn.bcebos.com/hotboard_image/0dc8dffb037379777a10b582f0798169']
].map(([title,fact,angle,risk,imageUrl])=>({tab:'社会热点',cat:risk==='高'?'风险提醒':'社会民生',hot:true,title,source:'百度热搜 · 实时榜',sourceUrl:'https://top.baidu.com/board?tab=realtime',imageUrl,fact,hook:`「${title}」刷屏后，普通家庭最该关心的是什么？`,angle,action:'用「发生了什么—与我何关—现在能做什么」三段式展开。',risk,score:'百度实时热榜 · 直连'}));
window.XIAOGU_RESEARCH_CACHE = window.XIAOGU_RESEARCH_CACHE.flat().concat(xiaoguBaiduRealtime);
