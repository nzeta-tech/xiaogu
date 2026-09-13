export type DigitalHumanCreationReferenceSample = {
  id: string;
  name: string;
  pose: string;
  tags: string[];
  coverUrl: string;
  videoUrl: string;
};

const mediaBase = "/api/digital-human-reference-media";

export const chanjingCreationReferenceSamples: DigitalHumanCreationReferenceSample[] = [
  { id: "wenhao-sit", name: "专业讲解·坐姿", pose: "坐姿半身", tags: ["正面镜头", "商务", "手势克制"], coverUrl: `${mediaBase}/wenhao-sit/cover`, videoUrl: `${mediaBase}/wenhao-sit/video` },
  { id: "xiaojie-standing", name: "亲和表达·站姿", pose: "全身站姿", tags: ["全身入镜", "自然手势", "竖版"], coverUrl: `${mediaBase}/xiaojie-standing/cover`, videoUrl: `${mediaBase}/xiaojie-standing/video` },
  { id: "haicheng-standing", name: "休闲口播·站姿", pose: "全身站姿", tags: ["正面站立", "休闲着装", "稳定机位"], coverUrl: `${mediaBase}/haicheng-standing/cover`, videoUrl: `${mediaBase}/haicheng-standing/video` },
  { id: "boyuan-sit", name: "沉稳分享·坐姿", pose: "坐姿半身", tags: ["坐姿稳定", "自然表情", "留出边缘"], coverUrl: `${mediaBase}/boyuan-sit/cover`, videoUrl: `${mediaBase}/boyuan-sit/video` },
  { id: "wanru-sit", name: "温和讲述·坐姿", pose: "坐姿半身", tags: ["光线均匀", "目视镜头", "背景简洁"], coverUrl: `${mediaBase}/wanru-sit/cover`, videoUrl: `${mediaBase}/wanru-sit/video` },
  { id: "haicheng-casual", name: "自然交流·坐姿", pose: "坐姿半身", tags: ["休闲表达", "动作自然", "竖版"], coverUrl: `${mediaBase}/haicheng-casual/cover`, videoUrl: `${mediaBase}/haicheng-casual/video` },
];
