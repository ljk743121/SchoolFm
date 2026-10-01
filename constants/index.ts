import type { TMediaSource, TPermission } from "~~/types";

export const permissionNames: { value: TPermission; label: string; icon: string }[] = [
  { value: "login", label: "登录", icon: "lucide:log-in" },
  { value: "admin", label: "管理", icon: "lucide:settings-2" },
  { value: "arrange", label: "排歌", icon: "lucide:arrow-down-wide-narrow" },
  { value: "manageUser", label: "管理用户", icon: "lucide:user-cog" },
  { value: "review", label: "审核歌曲", icon: "lucide:music-4" },
  { value: "time", label: "开放时间", icon: "lucide:clock" },
  { value: "blockWords", label: "屏蔽词", icon: "lucide:ban" },
  { value: "announcement", label: "公告管理", icon: "lucide:message-square" },
  { value: "robot", label: "机器人", icon: "lucide:bot" },
  { value: "deleteUser", label: "删除用户", icon: "lucide:user-minus" },
  { value: "editPermissions", label: "编辑权限", icon: "lucide:edit" },
  { value: "resetPassword", label: "重置密码", icon: "lucide:key" },
  { value: "deleteSong", label: "删除歌曲", icon: "lucide:trash" },
  { value: "deleteArrangement", label: "删除排歌", icon: "lucide:trash" },
  { value: "config", label: "管理配置", icon: "lucide:settings" },
  { value: "manualArrange", label: "手动排歌", icon: "lucide:arrow-down-wide-narrow" },
];

export const musicSources: { value: TMediaSource; label: string }[] = [
  { value: "wy", label: "网易云" },
  { value: "tx", label: "QQ音乐" },
  { value: "bilibili", label: "Bilibili视频" },
];

export const requestHeaders = {
  wy: "https://music.163.com",
  tx: "https://y.qq.com",
  bilibili: "https://www.bilibili.com",
};

export const defaultConfigs: { key: string; value: string; label: string }[] = [
  { key: "isRegisterOpen", value: "true", label: "开放注册" },
  { key: "blockWordsApi", value: "true", label: "第三方屏蔽词检测" },
  { key: "auth", value: "false", label: "学校注册认证" },
  { key: "monitorHasPlayed", value: "false", label: "监控是否完成放歌任务" },
];

export const breadCrumb: Record<string, string> = {
  admin: "管理",
  user: "用户管理",
  review: "歌曲审核",
  arrange: "排歌列表",
  time: "开放时间",
  words: "屏蔽词",
  songs: "歌曲",
  announcement: "公告管理",
  notifications: "通知",
  general: "通用界面",
  watchSongs: "查看点歌情况",
  editPermissions: "编辑权限",
  deleteUser: "删除用户",
  resetPassword: "重置密码",
  config: "配置管理",
  manualArrange: "手动排歌",
};

export const pwRegex = /.*(?=.*\d)(?=.*[A-Za-z]).*/;

export const resetPassword = "Abc123456";
export const defaultVipSign = "vip-song";
export const MAX_DAILY_SONG_DURATION = 45 * 60;
// 每天开始播放的时间（HH:mm），用于预估歌曲播放时间
export const START_TIME = "18:30";
export const SCHOOL_NAME = "实验之声广播站";

export const searchBaseURL = {
  wySearch: "https://music.163.com/api/search/get",
  wyDetails: "https://music.163.com/api/song/detail",
  qqSearch: "https://c.y.qq.com/soso/fcgi-bin/client_search_cp",
  qqPURL: "https://u.y.qq.com/cgi-bin/musicu.fcg",
  bbSearch: "https://api.bilibili.com/x/web-interface/search/type",
};

export const mediaBaseURL = {
  wyOfficial: "https://music.163.com/api/song/enhance/player/url",
  wyOfficial2: "https://music.163.com/song/media/outer/url?id=",
  qqOfficial: "http://ws.stream.qqmusic.qq.com/",
  wyMeting: "https://api.qijieya.cn/meting/?server=netease&type=url&id=",
  qqMeting: "https://api.qijieya.cn/meting/?server=tencent&type=url&id=",
  wyVkey: "https://api.vkeys.cn/v2/music/netease",
  qqVkey: "https://api.vkeys.cn/v2/music/tencent/geturl",
  bbOfficial: "https://api.bilibili.com/x/web-interface/view",
  bbOfficialm2: "https://api.bilibili.com/x/player/playurl",
};

export const imgBaseURL: Record<string, string> = {
  wy: "https://", // no imgId
  tx: "https://y.qq.com/music/photo_new/T002R800x800M000",
  bilibili: "",
};

export function getImgUrl(imgId: string, source: string) {
  return `${imgBaseURL[source]}${imgId}.jpg`;
}

export function getMusicSourceName(id: TMediaSource | undefined | null) {
  if (!id)
    return "无音源";
  return musicSources.find(source => source.value === id)?.label;
}

// export const proxy = {
//   "/api/bb/**": {
//     proxy: {
//       to: "https://api.bilibili.com/**",
//       headers: {
//         Origin: "https://www.bilibili.com",
//       },
//     },
//     ssr: false,
//   },
//   "/api/wy/**": {
//     proxy: {
//       to: "https://music.163.com/**",
//       headers: {
//         Origin: "https://music.163.com",
//       },
//     },
//     ssr: false,
//   },
//   "/api/txu/**": {
//     proxy: {
//       to: "https://u.y.qq.com/**",
//       headers: {
//         Origin: "https://u.y.qq.com",
//       },
//     },
//     ssr: false,
//   },
//   "/api/txc/**": {
//     proxy: {
//       to: "https://c.y.qq.com/**",
//       headers: {
//         Origin: "https://c.y.qq.com",
//       },
//     },
//     ssr: false,
//   },
// };
