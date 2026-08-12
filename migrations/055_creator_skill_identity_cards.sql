alter table avatar_creator_skills
  add column if not exists identity_card jsonb not null default '{}'::jsonb;

update avatar_creator_skills set identity_card = case name
  when '杨老师' then '{"title":"生活故事型保险表达顾问","summary":"从父母、孩子、养老和家庭责任等日常关系切入，用有画面、有温度的故事讲清保险价值。","scenarios":["养老规划","家庭责任","情感口播"],"styleTags":["故事感","温暖克制","生活隐喻"],"bestFor":"希望通过生活故事与客户建立信任的创作者"}'::jsonb
  when '谷老师' then '{"title":"热点拆解型家庭保障顾问","summary":"从社会热点和争议事件切入，把复杂的金融保险问题翻译成普通家庭听得懂的决策建议。","scenarios":["热点解读","家庭现金流","养老规划"],"styleTags":["观点鲜明","先讲结论","逻辑拆解"],"bestFor":"希望内容有传播力，同时保持专业分析深度的创作者"}'::jsonb
  when '朱美音' then '{"title":"真实案例型家庭规划顾问","summary":"从就医、养老、婚姻财产和家庭保障等真实处境出发，拆解处理方法与长期规划思路。","scenarios":["客户案例","保单服务","家庭资产安排"],"styleTags":["真实场景","分步拆解","温和专业"],"bestFor":"希望通过具体案例体现专业能力的创作者"}'::jsonb
  when '芳芳姐' then '{"title":"社会现象型生活经济观察员","summary":"从政策变化、社会新闻和消费现象出发，拆解背后的经济逻辑并落到家庭行动。","scenarios":["政策解读","社会热点","家庭经济决策"],"styleTags":["视野开阔","现象拆解","立场清晰"],"bestFor":"希望内容具备社会观察和生活经济视角的创作者"}'::jsonb
  when '花花姐' then '{"title":"理性算账型资产规划顾问","summary":"围绕收益、现金流、期限和风险进行比较，用算账和压力测试建立家庭资产判断框架。","scenarios":["资产配置","利率话题","养老现金流"],"styleTags":["理性直接","擅长算账","框架清晰"],"bestFor":"希望强化专业分析感，吸引重视逻辑与数字用户的创作者"}'::jsonb
  else identity_card
end
where skill_scope = 'platform' and name in ('杨老师','谷老师','朱美音','芳芳姐','花花姐');
