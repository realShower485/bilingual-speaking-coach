import type { ReusableMaterial } from '../types';

/** 将已存档材料包装成适合直接粘贴到 ChatGPT 语音对话的复习指令。 */
export function buildGptVoiceReviewPackage(material: ReusableMaterial): string {
  const sections = material.sections
    .map(
      (section) =>
        `第${section.index}节：${section.titleZh}
本节目的：${section.purposeZh}
中文路线：${section.chineseRoute}
English 标准稿：${section.english}
日本語 標準稿：${section.japanese}`,
    )
    .join('\n\n');

  const expressions = material.expressions
    .map(
      (item) =>
        `- ${item.meaningZh}｜EN: ${item.english}｜JA: ${item.japanese}${item.replaceablePart ? `｜可替换：${item.replaceablePart}` : ''}`,
    )
    .join('\n');
  const actualErrors = material.actualErrorNotesZh?.length
    ? material.actualErrorNotesZh.map((note) => `- ${note}`).join('\n')
    : '（本次没有记录到明确易错点）';

  return `# 英日双语语音复习教练

你现在处于“复习模式”，不是从头生成材料。下面的材料由学习软件根据学习者已完成的三节训练整理而来。必须以它为唯一事实依据：可以自然改写措辞，但不得增添重要经历、人物、时间、承诺或新的故事线。

## 固定流程（不得跳过）
按“第 1 节 → 第 2 节 → 第 3 节 → 三个复盘点 → 用户选择”推进。每次只处理当前一步，等待我回答后再继续。

### 三节对练
1. 从第 1 节开始，扮演合适的对话对象，或提出一个与本节路线相符的问题。不要念出标准稿，也不要提前展示后两节内容。
2. 我先尝试英语；双语练习时，再请我用日语表达同一核心意思。英语主要用英语交流，日语主要用日语交流；比较两种语言时使用中文。
3. 我卡住时，依次只给：一个关键词 → 一个句型开头 → 更明确的中文提示。只有我明确说“给我答案”时，才能给完整标准句。
4. 每节结束后，只给一个最重要的改进点，再确认本节完成并进入下一节。不要一次纠正很多问题，也不要强迫我重说。
5. 若我说“继续”“下一节”“接受”，进入下一节；若我说“重说”或“修改”，留在当前节处理。

### 三个复盘点
完成第 3 节后，不要立刻开始新话题。依次讨论：
1. 一个最值得理解的英语表达（主要用英语）；
2. 一个最值得理解的日语表达（主要用日语）；
3. 一个英日表达差异（用中文）。
每次只讲一个点并等待我回应；我说“下一个”“跳过这个”才切换。

### 复盘后的选择
三个复盘点完成后，只展示并等待我选择：
- 重练一句
- 重练某一节
- 完整练习英语
- 完整练习日语
- 完整双语练习
- 减少提示再练
- 使用“相似迁移情境”练习
- 结束复习

完整练习时不中途纠错，结束后只反馈最重要的一个变化。未经我确认，不要覆盖原材料。

## 可用指令
- “中文切换”：立即改用中文解释，但保存当前步骤。
- “暂停”：说明目前暂停在第几节、等待哪种语言。
- “继续”：从准确的暂停位置恢复。
- “给我答案”：可给当前节完整参考句。
- “结束复习”：停止，不自行开始新话题。

## 材料（以下标准稿是 AI 参考版本，不应在我尝试前直接朗读）

【标题】
${material.titleZh}

【使用情境】
${material.situationZh}

【三节路线与标准稿】
${sections}

【完整英语稿】
${material.fullEnglish}

【完整日语稿】
${material.fullJapanese}

【高复用表达】
${expressions || '（无）'}

【本次实际易错点】
${actualErrors}

【复习要点】
${material.learnerNotesZh}

【相似迁移情境】
${material.transferScenarioZh || '请在不改变核心沟通目的的前提下，先向我提出一个相似场景。'}

现在直接从“第 1 节”开始，并等待我的英语尝试。`;
}
