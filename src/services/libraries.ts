import type {
  PhrasebookCategory,
  ScenarioItem,
  ScenarioLibrary,
  TopicItem,
  TopicLibrary,
} from '../types';

// ===== 角色扮演场景库 =====

const SCENARIOS: ScenarioItem[] = [
  {
    id: 'ordering_food',
    title: { zh: '点餐', en: 'Ordering Food', ja: '食事を注文する' },
    description: {
      zh: '在餐厅就座后向服务员点餐,询问菜品、提出忌口与结账。',
      en: 'You are at a restaurant. Order from the waiter, ask about dishes, mention allergies, and ask for the bill.',
      ja: 'レストランで店員に注文し、料理について質問し、アレルギーを伝えてお会計を頼む。',
    },
    npcRole: '餐厅服务员 / Waiter at a restaurant / 飲食店の店員',
  },
  {
    id: 'job_interview',
    title: { zh: '面试', en: 'Job Interview', ja: '面接' },
    description: {
      zh: '参加一场求职面试,回答面试官关于经历、动机与优势的提问。',
      en: 'You are in a job interview. Answer questions about your experience, motivation, and strengths.',
      ja: '就職面接を受け、経歴や志望動機、長所について面接官の質問に答える。',
    },
    npcRole: '面试官 / Job interviewer / 面接官',
  },
  {
    id: 'airport',
    title: { zh: '机场', en: 'At the Airport', ja: '空港で' },
    description: {
      zh: '在机场办理值机、托运、安检问询与寻找登机口。',
      en: 'At the airport: check in, drop off baggage, answer security questions, and find your gate.',
      ja: '空港でチェックイン、荷物預け、保安質問に答え、搭乗口を探す。',
    },
    npcRole: '机场地勤 / Airport ground staff / 空港スタッフ',
  },
  {
    id: 'hospital',
    title: { zh: '医院', en: 'At the Hospital', ja: '病院で' },
    description: {
      zh: '在医院向医生或护士描述症状、回答病史询问、理解用药说明。',
      en: 'At a hospital: describe your symptoms to the doctor/nurse, answer questions about your history, understand medication instructions.',
      ja: '病院で医師や看護師に症状を伝え、既往歴の質問に答え、薬の説明を理解する。',
    },
    npcRole: '医院前台/护士 / Hospital receptionist or nurse / 病院の受付・看護師',
  },
  {
    id: 'renting_apartment',
    title: { zh: '租房', en: 'Renting an Apartment', ja: '部屋を借りる' },
    description: {
      zh: '与房东或中介看房,询问租金、押金、租期与房屋设施。',
      en: 'Viewing an apartment with the landlord/agent: ask about rent, deposit, lease term, and facilities.',
      ja: '不動産業者や大家と内見し、家賃、敷金、契約期間、設備について質問する。',
    },
    npcRole: '房东/中介 / Landlord or real-estate agent / 不動産業者・大家',
  },
  {
    id: 'shopping',
    title: { zh: '购物', en: 'Shopping', ja: '買い物' },
    description: {
      zh: '在商店向店员询问商品、尺码、价格、退换货政策并完成购买。',
      en: 'In a shop: ask the assistant about products, sizes, prices, and return policy, then make a purchase.',
      ja: '店で店員に商品、サイズ、価格、返品規定を尋ね、購入を済ませる。',
    },
    npcRole: '商店店员 / Shop assistant / 店員',
  },
  {
    id: 'asking_directions',
    title: { zh: '问路', en: 'Asking for Directions', ja: '道を尋ねる' },
    description: {
      zh: '在街头向当地人问路,听懂方向描述并确认距离与交通方式。',
      en: 'On the street: ask a local for directions, understand the instructions, and confirm distance and transport.',
      ja: '道端で地元の人に道を尋ね、方向の説明を理解し、距離と交通手段を確認する。',
    },
    npcRole: '被问路的当地人 / Local passerby / 道を聞かれる地元の人',
  },
  {
    id: 'social_small_talk',
    title: { zh: '社交寒暄', en: 'Social Small Talk', ja: '社交の雑談' },
    description: {
      zh: '在聚会上与刚认识的人寒暄,介绍自己、聊兴趣与近况。',
      en: 'At a party: make small talk with someone you just met, introduce yourself, and chat about hobbies and recent life.',
      ja: 'パーティーで初めて会った人と雑談し、自己紹介をして趣味や最近の出来事を話す。',
    },
    npcRole: '聚会上刚认识的朋友 / New acquaintance at a party / パーティーで初めて会った人',
  },
];

export const scenarioLibrary: ScenarioLibrary = { scenarios: SCENARIOS };

// ===== 主题讨论库 =====

const TOPICS: TopicItem[] = [
  {
    id: 'technology',
    title: { zh: '科技', en: 'Technology', ja: 'テクノロジー' },
    description: {
      zh: '讨论科技如何改变生活、工作与人际关系。',
      en: 'Discuss how technology changes the way we live, work, and relate to each other.',
      ja: 'テクノロジーが私たちの生活、仕事、人間関係をどう変えるか話し合う。',
    },
    sampleQuestions: [
      {
        en: 'Does technology make us more or less connected?',
        ja: 'テクノロジーは人と人を近づけていますか、それとも遠ざけていますか?',
      },
      {
        en: 'What tech habit would you like to change?',
        ja: '変えたいテクノロジーの習慣はありますか?',
      },
    ],
  },
  {
    id: 'culture',
    title: { zh: '文化', en: 'Culture', ja: '文化' },
    description: {
      zh: '比较不同文化的习俗、礼仪与价值观差异。',
      en: 'Compare customs, etiquette, and values across cultures.',
      ja: '異文化の習慣、礼儀、価値観の違いを比較する。',
    },
    sampleQuestions: [
      {
        en: "What's a tradition you'd like to share with foreigners?",
        ja: '外国人に紹介したい伝統は何ですか?',
      },
      {
        en: 'How is politeness expressed differently across cultures?',
        ja: '異文化で礼儀の表現はどう違いますか?',
      },
    ],
  },
  {
    id: 'daily_life',
    title: { zh: '生活', en: 'Daily Life', ja: '日常生活' },
    description: {
      zh: '描述日常作息、习惯与让生活更好的小事。',
      en: 'Describe daily routines, habits, and the small things that make life better.',
      ja: '日常のルーティンや習慣、生活を良くする小さな出来事を話す。',
    },
    sampleQuestions: [
      {
        en: 'Describe your typical morning routine.',
        ja: 'いつもの朝のルーティンを教えてください。',
      },
      {
        en: 'What small thing makes your day better?',
        ja: '一日を良くする小さなことは何ですか?',
      },
    ],
  },
  {
    id: 'society',
    title: { zh: '社会', en: 'Society', ja: '社会' },
    description: {
      zh: '讨论社会议题、社区参与与个人责任。',
      en: 'Discuss social issues, community involvement, and individual responsibility.',
      ja: '社会問題、地域社会への参加、個人の責任について話し合う。',
    },
    sampleQuestions: [
      {
        en: 'What social issue concerns you the most?',
        ja: '一番気になる社会問題は何ですか?',
      },
      {
        en: 'How can individuals help their community?',
        ja: '個人が地域社会に貢献するにはどうすればいいですか?',
      },
    ],
  },
  {
    id: 'education',
    title: { zh: '教育', en: 'Education', ja: '教育' },
    description: {
      zh: '探讨学习方式、学校教育与终身学习。',
      en: 'Explore learning methods, schooling, and lifelong learning.',
      ja: '学び方、学校教育、生涯学習について探る。',
    },
    sampleQuestions: [
      {
        en: 'Is self-study or classroom learning more effective?',
        ja: '独学と教室学習、どちらが効果的ですか?',
      },
      {
        en: 'What subject should be taught more in schools?',
        ja: '学校でもっと教えるべき科目は何ですか?',
      },
    ],
  },
  {
    id: 'environment',
    title: { zh: '环境', en: 'Environment', ja: '環境' },
    description: {
      zh: '讨论环保习惯、可持续生活与责任归属。',
      en: 'Discuss eco-friendly habits, sustainable living, and who is responsible.',
      ja: 'エコな習慣、持続可能な生活、責任の所在について話し合う。',
    },
    sampleQuestions: [
      {
        en: 'What eco-friendly habit do you practice?',
        ja: '実践しているエコな習慣はありますか?',
      },
      {
        en: 'Who bears more responsibility: individuals or governments?',
        ja: '環境保護の責任は個人と政府、どちらが大きいですか?',
      },
    ],
  },
  {
    id: 'travel',
    title: { zh: '旅行', en: 'Travel', ja: '旅行' },
    description: {
      zh: '分享旅行经历、偏好与旅途中的文化体验。',
      en: 'Share travel experiences, preferences, and cultural encounters on the road.',
      ja: '旅行の経験や好み、道中の文化体験を共有する。',
    },
    sampleQuestions: [
      {
        en: "What's the most memorable trip you've taken?",
        ja: '一番思い出に残っている旅行はどこですか?',
      },
      {
        en: 'Do you prefer planned or spontaneous travel?',
        ja: '計画旅行とふらっと旅、どちらが好きですか?',
      },
    ],
  },
  {
    id: 'work',
    title: { zh: '工作', en: 'Work', ja: '仕事' },
    description: {
      zh: '讨论职场文化、工作生活平衡与职业发展。',
      en: 'Discuss workplace culture, work-life balance, and career growth.',
      ja: '職場文化、ワークライフバランス、キャリア形成について話し合う。',
    },
    sampleQuestions: [
      {
        en: 'What makes a good workplace?',
        ja: '良い職場の条件は何ですか?',
      },
      {
        en: 'Is work-life balance achievable?',
        ja: 'ワークライフバランスは実現可能ですか?',
      },
    ],
  },
];

export const topicLibrary: TopicLibrary = { topics: TOPICS };

// ===== 常用句手册(按功能分类) =====

export const phrasebook: PhrasebookCategory[] = [
  {
    id: 'uncertainty',
    title: { zh: '不确定/犹豫', en: 'Uncertainty / Hesitation', ja: '迷い・ためらい' },
    phrases: [
      { en: "I'm not sure how to say this...", ja: 'どう言えばいいか分からなくて…' },
      { en: 'Let me think for a second.', ja: '少し考えさせてください。' },
      { en: "I can't quite find the right word.", ja: 'ちょうどいい言葉が見つからないです。' },
      { en: 'How should I put this...', ja: 'どう表現したらいいかな…' },
      { en: "I'm hesitating between two expressions.", ja: '二つの言い方で迷っています。' },
    ],
  },
  {
    id: 'request_repeat',
    title: { zh: '请求重复', en: 'Asking to Repeat', ja: 'もう一度頼む' },
    phrases: [
      { en: 'Could you say that again, please?', ja: 'もう一度言ってもらえますか?' },
      { en: "Sorry, I didn't catch that.", ja: 'すみません、聞き取れませんでした。' },
      { en: 'Can you repeat the last part?', ja: '最後の部分を繰り返してもらえますか?' },
      { en: 'Pardon me?', ja: 'もう一度お願いできますか?' },
      { en: 'Would you mind saying that more slowly?', ja: 'もう少しゆっくり言ってもらえますか?' },
      { en: 'I missed what you just said.', ja: '今の聞きそびれてしまいました。' },
    ],
  },
  {
    id: 'ask_grammar',
    title: { zh: '询问语法', en: 'Asking about Grammar', ja: '文法を尋ねる' },
    phrases: [
      { en: 'Is this the right tense to use here?', ja: 'ここはこの時制で合っていますか?' },
      { en: 'Should this be countable or uncountable?', ja: 'これは可算名詞ですか、それとも不可算ですか?' },
      { en: 'Do I need a particle after this word?', ja: 'この語の後に助詞は要りますか?' },
      { en: 'Is this verb transitive or intransitive?', ja: 'この動詞は他動詞ですか、自動詞ですか?' },
      { en: 'Why use the past tense here?', ja: 'なぜここは過去形なんですか?' },
      { en: 'Does this adjective conjugate?', ja: 'この形容詞は活用しますか?' },
    ],
  },
  {
    id: 'request_explanation',
    title: { zh: '请求解释', en: 'Asking for Explanation', ja: '説明を頼む' },
    phrases: [
      { en: 'Could you explain what this means?', ja: 'これがどういう意味か説明してもらえますか?' },
      { en: "I don't understand this expression.", ja: 'この表現が分かりません。' },
      { en: 'Can you break it down for me?', ja: '分かりやすく説明してもらえますか?' },
      { en: "What's the nuance of this word?", ja: 'この言葉のニュアンスは何ですか?' },
      { en: 'Could you give an example?', ja: '例をあげてもらえますか?' },
      { en: "What's the difference between these two?", ja: 'この二つの違いは何ですか?' },
    ],
  },
  {
    id: 'express_difficulty',
    title: { zh: '表达困难', en: 'Expressing Difficulty', ja: '難しさを伝える' },
    phrases: [
      { en: 'This is a bit hard for me.', ja: 'これはちょっと難しいです。' },
      { en: "I'm struggling with this concept.", ja: 'この概念には苦戦しています。' },
      { en: 'I keep making mistakes here.', ja: 'ここをいつも間違えてしまいます。' },
      { en: 'My vocabulary is limited on this topic.', ja: 'この話題の語彙が限られています。' },
      { en: 'I find the pronunciation tricky.', ja: '発音が難しく感じます。' },
      { en: "I'm not confident about my grammar.", ja: '文法に自信がありません。' },
    ],
  },
  {
    id: 'request_demo',
    title: { zh: '请求示范', en: 'Asking for a Demonstration', ja: 'お手本を頼む' },
    phrases: [
      { en: 'Could you model how to say it?', ja: 'どう言えばいいかお手本を見せてもらえますか?' },
      { en: 'Can you say it for me first?', ja: '先に言ってみてもらえますか?' },
      { en: 'Give me a sample sentence, please.', ja: '例文を見せてください。' },
      { en: 'How would a native speaker say this?', ja: 'ネイティブならどう言いますか?' },
      { en: 'Please demonstrate the natural way.', ja: '自然な言い方をお手本してください。' },
      { en: 'Say it slowly so I can follow.', ja: 'ゆっくり言ってください、ついていきます。' },
    ],
  },
];
