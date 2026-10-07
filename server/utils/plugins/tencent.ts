import type { TMediaSource } from "~~/types";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";

import { defaultVipSign, mediaBaseURL, searchBaseURL } from "~~/constants";
import { createPlugin } from "../plugin";

// the below code is adapted from https://github.com/lyswhut/lx-music-desktop/commit/ba62ae27af9f337adc8fbdbd48221ea1617360c4
// assisted by Kimi-K2.7-Coder
// start
const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19];
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5];
const SCRAMBLE_VALUES = [
  89,
  39,
  179,
  150,
  218,
  82,
  58,
  252,
  177,
  52,
  186,
  123,
  120,
  64,
  242,
  133,
  143,
  161,
  121,
  179,
];

function hashSHA1(data: string) {
  return crypto.createHash("sha1").update(data).digest("hex");
}

function pickHashByIdx(hash: string, indexes: number[]) {
  return indexes.map(idx => hash[idx]).join("");
}

function base64Encode(data: number[]) {
  return Buffer.from(data)
    .toString("base64")
    .replace(/[\\/+=]/g, "");
}

async function zzcSign(text: string) {
  const hash = hashSHA1(text);
  const part1 = pickHashByIdx(hash, PART_1_INDEXES);
  const part2 = pickHashByIdx(hash, PART_2_INDEXES);
  const part3 = SCRAMBLE_VALUES.map(
    (value, i) => value ^ Number.parseInt(hash.slice(i * 2, i * 2 + 2), 16),
  );
  const b64Part = base64Encode(part3).replace(/[\\/+=]/g, "");
  return `zzc${part1}${b64Part}${part2}`.toLowerCase();
}

async function signRequest<T, B extends object = object>(data: B): Promise<T> {
  const sign = await zzcSign(JSON.stringify(data));
  const res = await $fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
    method: "POST",
    headers: {
      "User-Agent": "QQMusic 14090508(android 12)",
    },
    body: data,
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText) as T;
      } catch {
        return responseText as T;
      }
    },
  });
  return res as T;
}

interface ISongSearchResult {
  id: string;
  name: string;
  artists: string;
  album: string;
  source: TMediaSource;
  imgId: string;
  duration: number;
}

async function officialSearch(key: string): Promise<ISongSearchResult[]> {
  const bodyData = {
    comm: {
      ct: "11",
      cv: "14090508",
      v: "14090508",
      tmeAppID: "qqmusic",
      phonetype: "EBG-AN10",
      deviceScore: "553.47",
      devicelevel: "50",
      newdevicelevel: "20",
      rom: "HuaWei/EMOTION/EmotionUI_14.2.0",
      os_ver: "12",
      OpenUDID: "0",
      OpenUDID2: "0",
      QIMEI36: "0",
      udid: "0",
      chid: "0",
      aid: "0",
      oaid: "0",
      taid: "0",
      tid: "0",
      wid: "0",
      uid: "0",
      sid: "0",
      modeSwitch: "6",
      teenMode: "0",
      ui_mode: "2",
      nettype: "1020",
      v4ip: "",
    },
    req: {
      module: "music.search.SearchCgiService",
      method: "DoSearchForQQMusicMobile",
      param: {
        search_type: 0,
        searchid: Math.random().toString().slice(2),
        query: key,
        page_num: 1,
        num_per_page: 15,
        highlight: 0,
        nqc_flag: 0,
        multi_zhida: 0,
        cat: 2,
        grp: 1,
        sin: 0,
        sem: 0,
      },
    },
  };

  interface TSearchDataItem {
    file?: {
      media_mid?: string;
    };
    title?: string;
    id?: string;
    mid?: string;
    album?: {
      name?: string;
      mid?: string;
    };
    singer?: { name?: string; mid?: string }[];
    interval?: number;
  }

  interface TSearchResponse {
    code: number;
    req: {
      code: number;
      data?: {
        body?: {
          item_song?: TSearchDataItem[];
        };
        meta?: {
          estimate_sum?: number;
        };
      };
    };
  }

  const body = await signRequest<TSearchResponse>(bodyData);

  if (!body || body.code !== 0 || body.req.code !== 0 || !body.req.data?.body?.item_song) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `QQ音乐搜索失败 (code: ${body?.code}, req.code: ${body?.req?.code})`,
    });
  }

  const songList = body.req.data.body.item_song
    .filter(item => item.file?.media_mid)
    .map((item) => {
      const albumMid = item.album?.mid ?? "";
      const singerMid = item.singer?.[0]?.mid ?? "";
      return {
        id: item.mid ?? "",
        name: item.title ?? "",
        artists:
          item.singer
            ?.map(artist => artist.name)
            .join(", ")
            .trim() ?? "",
        album: item.album?.name ?? "",
        source: "tx" as TMediaSource,
        imgId: albumMid || singerMid,
        duration: item.interval ?? 0,
      };
    });

  return songList;
}
// end

async function officialFetch(mid: string) {
  const serverBaseURL = mediaBaseURL.qqOfficial;
  const songBaseURL = searchBaseURL.qqPURL;
  const PREFIX = "M500";
  const SUFFIX = "mp3";
  const songData = `{"req_0":{"module":"vkey.GetVkeyServer","method":"CgiGetVkey","param":{"filename":["${PREFIX}${mid}${mid}.${SUFFIX}"],"guid":"10000","songmid":["${mid}"],"songtype":[0],"uin":"0","loginflag":1,"platform":"20"}},"loginUin":"0","comm":{"uin":"0","format":"json","ct":24,"cv":0}}`;
  interface TQQSongResponse {
    req_0: {
      data: {
        midurlinfo: {
          purl: string;
          vkey: string;
        }[];
      };
    };
  }

  const resPURL = await $fetch<TQQSongResponse>(songBaseURL, {
    method: "GET",
    params: {
      format: "json",
      data: songData,
    },
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    },
    onResponseError() {
      throw new TRPCError({ code: "BAD_REQUEST", message: "获取歌曲链接失败" });
    },
  });
  const purl = resPURL.req_0.data.midurlinfo[0]?.purl ?? "";
  if (purl.length < 1)
    throw new TRPCError({ code: "BAD_REQUEST", message: defaultVipSign });

  return {
    url: `${serverBaseURL}${purl}`.replace(/^http:/, "https:"),
    pay: false,
  };
}

async function vkeyFetch(mid: string) {
  const songBaseURL = mediaBaseURL.qqVkey;
  if (!songBaseURL)
    throw new TRPCError({ code: "BAD_REQUEST", message: "服务器未配置请求源" });
  interface TSongURL {
    code: number;
    data: {
      url: string;
      song: string;
    };
  }

  const resSongsUrl = await $fetch<TSongURL>(songBaseURL, {
    method: "GET",
    params: {
      mid,
      quality: 8,
    },
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    },
  });
  if (resSongsUrl.code !== 200) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "第三方服务器繁忙，请稍后再试",
    });
  }
  if (!resSongsUrl.data.url) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "获取VIP歌曲链接失败" });
  }
  return {
    url: resSongsUrl.data.url.replace(/^http:/, "https:"),
    pay: true,
  };
}

async function vkey3Fetch(mid: string) {
  const songBaseURL = mediaBaseURL.qqVkey3;
  if (!songBaseURL)
    throw new TRPCError({ code: "BAD_REQUEST", message: "服务器未配置请求源" });
  interface TSongURL {
    code: number;
    data: {
      url: string;
    };
  }

  const resSongsUrl = await $fetch<TSongURL>(songBaseURL, {
    method: "GET",
    params: {
      mid,
      quality: 8,
    },
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    },
  });
  if (!resSongsUrl.data.url) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "获取VIP歌曲链接失败" });
  }
  return {
    url: resSongsUrl.data.url.replace(/^http:/, "https:"),
    pay: true,
  };
}

async function metingapiFetch(id: string) {
  const target_url = mediaBaseURL.qqMeting;
  const res = await fetch(`${target_url}${id}`, {
    method: "GET",
    redirect: "follow",
  }).then((res) => {
    if (res.url === `${target_url}${id}`)
      throw new TRPCError({ code: "BAD_REQUEST", message: "获取歌曲链接失败" });
    return res;
  });
  return { url: res.url, pay: false };
}

export const qqmusic = createPlugin({
  name: "tx",
  alias: "QQ音乐",
  searchSongs: { fn: officialSearch, retryCount: 5 },
  getMusicUrl: [
    { fn: officialFetch, priority: 1, retryCount: 1 },
    { fn: metingapiFetch, priority: 0.9, retryCount: 1 },
    { fn: vkey3Fetch, priority: 0.8, retryCount: 3 },
    { fn: vkeyFetch, priority: 0.7, retryCount: 2 },
  ],
});
