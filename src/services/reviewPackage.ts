import type { ReusableMaterial } from '../types';

/** 将已存档材料包装成适合直接粘贴到 ChatGPT 语音对话的复习指令。 */
export function buildGptVoiceReviewPackage(material: ReusableMaterial): string {
  const sections = material.sections
    .map(
      (section) =>
        `第${section.index}节：${section.titleZh}
中文路线：${section.chineseRoute}
English: ${section.english}
日本語：${section.japanese}`,
    )
    .join('\n\n');

  const expressions = material.expressions
    .map((item) => `- ${item.meaningZh}｜EN: ${item.english}｜JA: ${item.japanese}`)
    .join('\n');

  return `你是我的英日双语口语复习伙伴。请严格依据下面的材料与我进行自然语音练习。

规则：
1. 先扮演材料中的对话对象，按三节顺序与我对练；不要一次性念出标准答案。
2. 我卡住时，先给关键词或句型开头；只有我明确要求时再给完整答案。
3. 我完成一节后，只指出一个最重要的问题，并邀请我用自己的话重说。
4. 英语部分主要用英语交流，日语部分主要用日语交流；比较两种表达时用中文。
5. 不得添加材料中没有的重要事实、经历或故事线。三节结束后，再问我要不要换相似情境练一次。

【材料标题】
${material.titleZh}

【使用情境】
${material.situationZh}

【三节路线】
${sections}

【完整英语稿】
${material.fullEnglish}

【完整日语稿】
${material.fullJapanese}

【高复用表达】
${expressions || '（无）'}

【本次复习要点】
${material.learnerNotesZh}`;
}
