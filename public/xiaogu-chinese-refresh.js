/* 中文呈现修订：社会热点改用新闻热榜；香港和国际均使用中文标题与摘要。 */
const xiaoguChineseHk = {
  'Inflation at 1.7% in July':['香港7月通胀升1.7%，基本通胀率维持1.9%','香港政府统计处公布，7月消费物价同比升1.7%，燃料相关项目压力仍较高。'],
  'HK as top preferred service platform':['调查：香港成为内地企业“出海”首选服务平台','香港贸发局调查显示，83%受访内地企业视香港为拓展海外业务的首选服务平台。'],
  'Govt welcomes country’s support':['内地保险资金获支持经互联互通投资香港ETF','香港政府欢迎有关安排，内容涉及内地保险机构通过南向交易投资香港ETF。'],
  'Land exchange open for applications':['新田科技城指定发展用地开放原址换地申请','香港地政总署就新田科技城指定发展用地邀请提交原址换地申请。'],
  "Govt's efficacy enhancement set":['香港首批30个AI效能提升项目分阶段推行','项目覆盖公共服务流程、申请处理与部门内部工作流程优化。'],
  'Port tabletop exercise held':['黄岗口岸举行跨部门桌上演练','演练围绕极端天气、停电、火警、交通事故及传染病等情境进行。'],
  'AI systems to boost smart mobility':['香港交通部门推进AI智慧出行与牌照服务','相关项目目标是缩短车辆牌照续期处理时间，并在合适路口试行自适应交通灯。'],
  'Huanggang Port drills quick response':['黄岗口岸进行应急演练测试快速响应','演练模拟交通事故、停电、电梯故障及短路等事故场景。'],
  'Keeper charged for dangerous dog':['香港一名危险犬饲养人被起诉','香港渔农自然护理署就未妥善控制大型犬只提出检控。']
};
const xiaoguSocialRefresh = [
  ['FreeJK · 澎湃新闻','“成都27岁女子遇害案”被害人母亲起诉网暴者获法院立案：想知道恶意从何而来','澎湃新闻当前热榜热度 341。','https://www.thepaper.cn/newsDetail_forward_33818955'],
  ['FreeJK · 澎湃新闻','上海市城市更新和住房发展“十五五”规划：到2030年，计划实施老旧小区改造3000万至4000万平方米','澎湃新闻当前热榜热度 86。','https://www.thepaper.cn/newsDetail_forward_33819239'],
  ['FreeJK · 澎湃新闻','一座城市，如何把体育变成生活方式？上海给出了答案','澎湃新闻当前热榜热度 185。','https://www.thepaper.cn/newsDetail_forward_33819078'],
  ['FreeJK · 澎湃新闻','人民锐评：座位讨论背后是规则共识','澎湃新闻当前热榜热度 89。','https://www.thepaper.cn/newsDetail_forward_33820087'],
  ['FreeJK · 澎湃新闻','上海出台楼市“沪八条”，精准施策促进合理购房需求积极释放','澎湃新闻当前热榜热度 331。','https://www.thepaper.cn/newsDetail_forward_33816779'],
  ['FreeJK · 今日头条','湖北通城集中销毁24辆“炸街”车','今日头条当前热榜热度 8127 万。','https://www.toutiao.com/trending/7676080993283736074/'],
  ['FreeJK · 今日头条','余承东官宣行业首发无网通信','今日头条当前热榜热度 7354 万。','https://www.toutiao.com/trending/7675557271434772530/'],
  ['FreeJK · 今日头条','公积金新政来了，有哪些利好','今日头条当前热榜热度 6654 万。','https://www.toutiao.com/trending/7676090755211038254/'],
  ['FreeJK · 今日头条','男子同学聚会拒敬酒遭殴打致死已判赔','今日头条当前热榜热度 6021 万。','https://www.toutiao.com/trending/7676096789639987227/'],
  ['FreeJK · 今日头条','医院能办结婚证了','今日头条当前热榜热度 5448 万。','https://www.toutiao.com/trending/7675507335318700058/']
].map(([source,title,fact,sourceUrl])=>({tab:'社会热点',cat:'社会民生',hot:true,title,source,sourceUrl,fact,hook:`「${title}」背后，普通人真正关心的是什么？`,angle:'从公共规则、家庭影响和可执行建议切入，不扩写未经证实的信息。',action:'用「事件—影响—行动」三段式展开。',risk:'中',score:'新闻热榜 · 当前信号'}));
const xiaoguInternationalRefresh = [
  '美债回购扩大难止收益率回升 贝森特：可继续加码','美国向盟友与中国下通牒 配合对伊朗毁灭性经济战','尼日利亚超载船只倾覆 约40名孩童罹难','加美会晤敲定贸易协议 细节浮出水面','日本彻查“爆买”寺庙交易 恐宗教成洗钱和逃税工具','韩国货柜船本周末起首次试航北极航线','特朗普扬言发动“经济诺曼底登陆战” 任何国家援助伊朗将受严惩','哥伦比亚非法金矿发生山体滑坡 13人死亡','朝美“暧昧期”：特朗普示好金正恩 朝鲜射导弹加码','伊朗和平前景黯淡 欧洲天然气价格升至五个月高点'
].map(title=>({tab:'国际',cat:'国际金融',hot:true,title,source:'联合早报 · 国际',sourceUrl:'https://www.zaobao.com.sg/realtime/world',fact:'联合早报国际版当前头条。',hook:`国际事件「${title}」会如何影响普通人的生活账本？`,angle:'从能源、贸易、就业或家庭风险的实际传导切入。',action:'用「远方事件—本地影响—家庭准备」三段式展开。',risk:'高',score:'国际中文头条'}));
window.XIAOGU_RESEARCH_CACHE = window.XIAOGU_RESEARCH_CACHE.flat().map(topic=>{
  const zh=xiaoguChineseHk[topic.title];
  return zh ? {...topic,title:zh[0],fact:zh[1]} : topic;
}).filter(topic=>topic.tab!=='社会热点'&&topic.tab!=='国际').concat(xiaoguSocialRefresh,xiaoguInternationalRefresh);
