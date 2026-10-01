/**
 * 常见问题（FAQ）数据源，页面见 app/pages/faq.vue
 *
 * 新增/删除条目的约定：
 * 1. 在 rawFaqItems 中增删一个对象即可，faqItems 与 faqGroups 会自动重算。
 * 2. id 用语义化的英文短横线命名（如 "forgot-password"），同时作为
 *    AccordionItem 的 value 和页面锚点，不要重复、不要用 item-1 这类序号。
 * 3. category 取 FaqCategory 中的值；新增分类需同时改 FaqCategory、
 *    faqCategoryOrder、faqCategoryLabels 三处。
 * 4. question 是行内 HTML（用 <strong> 加粗，不要写 **加粗**）。
 * 5. answer 是 Markdown，可以正常缩进书写（stripIndent 会去掉公共缩进），
 *    但同一个模板字符串内各行缩进必须一致：若首行顶格、其余行缩进，
 *    公共缩进为 0，Markdown 仍会把缩进识别为代码块导致正文渲染异常。
 */

export type FaqCategory = "account" | "submit" | "schedule" | "privacy";

export interface FaqItem {
  /** 语义化标识，同时作为 AccordionItem 的 value 与页面锚点 */
  id: string;
  category: FaqCategory;
  /** 问题标题，支持行内 HTML（如 <strong> 加粗） */
  question: string;
  /** Markdown 正文 */
  answer: string;
}

/** 去掉模板字符串的公共缩进，否则 Markdown 会把缩进当成代码块 */
function stripIndent(text: string) {
  const lines = text.split("\n");
  const indents = lines.filter(line => line.trim()).map(line => line.length - line.trimStart().length);
  const indent = Math.min(...indents);
  return indent > 0 ? lines.map(line => line.slice(indent)).join("\n") : text;
}

/** 顺序即页面展示顺序 */
export const faqCategoryOrder: FaqCategory[] = ["account", "submit", "schedule", "privacy"];

export const faqCategoryLabels: Record<FaqCategory, string> = {
  account: "账号与登录",
  submit: "投稿",
  schedule: "排歌与播放",
  privacy: "隐私与安全",
};

const rawFaqItems: FaqItem[] = [
  {
    id: "cannot-register",
    category: "account",
    question: "<strong>为什么我输入了正确的学号和密码还是不能注册？</strong>",
    answer: "这是学校账户认证的局限问题，请**联系管理员或到反馈群解决**",
  },
  {
    id: "change-real-name",
    category: "account",
    question: "账号注册后还可以更改真实姓名吗",
    answer: "不可以。注册后仅可以更改昵称。",
  },
  {
    id: "cannot-login",
    category: "account",
    question: "我输入了正确的学号和密码，但不能登录",
    answer: "你可能被管理员禁止登录，如果账号误封请联系管理员进行解封。",
  },
  {
    id: "nickname-required",
    category: "account",
    question: "提交歌曲时无法使用昵称投稿",
    answer: "你还没有设置昵称，请前往个人资料页面设置昵称。",
  },
  {
    id: "forgot-password",
    category: "account",
    question: "<strong>忘记密码怎么办？</strong>",
    answer: "目前没有开发忘记密码的功能，但可以重置密码。请联系管理员重置密码。",
  },
  {
    id: "contact-admin",
    category: "account",
    question: "<strong>如何联系管理员？</strong>",
    answer: `
      您可以通过以下方式联系管理员：

      - 发送邮件至管理员邮箱。**联系方式请在首页的“关于我们”或公告栏查看**。
      - 联系广播站管理人员
      - 加入反馈群。加入方式请查看公告。
    `,
  },
  {
    id: "submit-steps",
    category: "submit",
    question: "<strong>提交歌曲步骤</strong>",
    answer: `
      登录后，在首页点击"投稿"按钮即可进入歌曲提交页面。
      投稿前请先阅读投稿规则与本常见问题，检查是否已有相同歌曲，并尽量选择网易云音乐音源。

      - 在搜索框输入你想投稿的歌曲名或歌手名
      - 在上方选择框选择音源（推荐**网易云音乐**，BiliBili 其次，QQ 音乐最后选择(若QQ音乐无VIP可优先于BillBili)），点击搜索按钮
      - **注意**：若选择**QQ音乐的VIP歌曲**或**Bilibili视频**，请先试听确认是否完整和能否播放。
      - 在列表中选择你想投稿的歌曲，可点击播放按钮试听
      - 选择投稿时显示的名称：实名、匿名或昵称
      - 可选择期望播放日期；不选择时由系统自由分配
      - 可选填写私密留言或公开留言，确认无误后提交
      `,
  },
  {
    id: "cannot-delete",
    category: "submit",
    question: "为什么我投稿的歌曲有些不能删除",
    answer: "不能删除的原因是歌曲已经进入排歌列表或已被使用，无法删除，你只能删除自己投稿的未被排歌的歌曲。",
  },
  {
    id: "weekly-limit",
    category: "submit",
    question: "每周最多可以提交几次歌曲？",
    answer: `用户默认每周最大提交次数为三次。系统会在每周或距离你上次投稿满 5 天后重置次数。
提交前请确保当前处于开放投稿时间段内，并保证本周仍有剩余次数。`,
  },
  {
    id: "scheduling-rules",
    category: "schedule",
    question: "<strong>歌曲排歌规则是怎样的？</strong>",
    answer: `
      首先解释一个概念：期望播放日期。
      期望播放日期是可选填写的日期（格式 YYYY-MM-DD）。
      选择后，排歌系统会优先将该歌曲安排在这一天播放；不填写时，歌曲进入自由分配状态，由系统根据排歌规则自动安排。

      排歌时歌曲按以下顺序处理：

      - **期望日歌曲**：期望日在本次排歌区间内且未过期的歌曲，优先排到期望日。
      - **顺延（欠播）歌曲**：期望日已过（早于当天，当天不算已过）或早于本次区间的歌曲，从本次区间最早的可用日期开始补播，且不受落选状态影响。
      - **自由分配歌曲**：未填写期望日期的歌曲，填充剩余容量。
      - **不参与**：期望日在未来且不在本次排歌区间内的歌曲，本次既不安排也不标记落选，留到覆盖其期望日的排歌窗口处理。

      具体规则：

      - **每日时长限制**：每天播放总时长不超过 45 分钟
      - **排序优先级**：期望日接近度（与播放目标日期相同最优先，填了期望日期优先于未填写）> 歌曲状态（错过未播 > 已通过 > 落选 > 播放失败）> 投稿时间（早投稿优先）
      - **就近调整**：若期望日已满或不可用，系统会尝试调整到最近的可用日期
      - **抢占腾位**：当整个区间都排满时，为保证期望日/顺延歌曲播放，系统会挤掉当天「没有期望日期」的普通歌曲腾出空间，被挤掉的歌曲回到待排池等待下次排歌
      - **无法安排**：若区间内仍无法容纳，歌曲会被标记为未排上（落选），等待下一次排歌时处理`,
  },
  {
    id: "song-statuses",
    category: "schedule",
    question: "我的投稿会有哪些状态？",
    answer: `
      - **待审核**：已提交，等待审核员审核
      - **已通过**：审核通过，等待排歌
      - **已排歌**：已安排到具体播放日期
      - **已拒绝**：审核未通过，可查看拒绝理由
      - **落选**：在排歌区间内无法安排，但是可以在后续排歌时安排。
      - **错过未播**：因某些原因歌曲未实际播放，将会在下次排歌时优先安排
      - **播放失败**：因某些原因歌曲播放失败，将会在下次排歌时安排
      - **已播放**：歌曲已实际播放，系统会自动标记为已播放`,
  },
  {
    id: "password-security",
    category: "privacy",
    question: "<strong>我的密码会被其他人知道吗</strong>",
    answer: `不会。密码存储时使用了Hash加密，无法被直接查看，因此我们也无法告诉你忘记的密码。
但是网站在登录时传输密码时仅有可能使用HTTPS加密，若你使用HTTP登录，密码将被明文传输，存在安全风险。
请在安全的网络环境下登录，避免密码被截获。`,
  },
  {
    id: "display-mode",
    category: "privacy",
    question: "投稿时名称显示方式有什么区别？我的隐私如何保护？",
    answer: `
    投稿时可以选择以下三种显示方式：

    - **实名**：对他人显示你的真实姓名
    - **匿名**：对他人不显示任何投稿人名称
    - **昵称**：对他人显示你设置的昵称

    系统仅将学号、真实姓名、昵称等个人信息用于身份认证与服务提供，不会主动向第三方共享可识别你身份的信息。更多详情请阅读 [用户协议和隐私政策](/agreement)。`,
  },
  {
    id: "comment-visibility",
    category: "privacy",
    question: "留言的可见范围是什么？",
    answer: `
    - **私密留言**：仅审核员在审核和排歌时可见
    - **公开留言**：会在主页面展示，所有用户可见`,
  },
];

/** 对外导出的 FAQ 数据，正文已去掉公共缩进 */
export const faqItems: FaqItem[] = rawFaqItems.map(item => ({
  ...item,
  answer: stripIndent(item.answer),
}));

/** 按 faqCategoryOrder 分组，供页面直接渲染 */
export const faqGroups = faqCategoryOrder.map(category => ({
  category,
  label: faqCategoryLabels[category],
  items: faqItems.filter(item => item.category === category),
}));
