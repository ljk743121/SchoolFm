import type { TMediaSource } from "~~/types";
import { TRPCError } from "@trpc/server";

import { mediaBaseURL, searchBaseURL } from "~~/constants";
import { createPlugin } from "../plugin";

async function officialSearch(key: string) {
  const searchBase = searchBaseURL.wySearch;
  const detailsBase = searchBaseURL.wyDetails;

  interface TSearchResponse {
    code: number;
    result: {
      songs: {
        id: string;
      }[];
      songCount: number;
    };
  }

  interface TDetails {
    id: string;
    name: string;
    artists: {
      name: string;
    }[];
    album: {
      name: string;
      picUrl: string;
    };
    duration: number; // millisecond
  }

  interface TAlbumsResponse {
    code: number;
    songs: TDetails[];
  }

  if (!key) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "缺少搜索关键词" });
  }

  let songsIdList = <string[]>[];
  let resSongs = <TSearchResponse>{};

  resSongs = await $fetch<TSearchResponse>(searchBase, {
    method: "GET",
    params: {
      s: key,
      type: 1,
      offset: 0,
      limit: 15,
      total: true,
    },
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    },
  });
  if (resSongs.code !== 200 || !resSongs.result?.songs) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "搜索失败" });
  }

  songsIdList = resSongs.result.songs.map(song => song.id);

  const resAlbums = await $fetch<TAlbumsResponse>(detailsBase, {
    method: "GET",
    params: {
      ids: `[${songsIdList.join(",")}]`,
    },
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    },
  });

  if (resAlbums.code !== 200 || !resAlbums.songs) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "获取歌曲信息失败" });
  }

  const transformSongs = resAlbums.songs.map(song => ({
    id: song.id.toString(),
    name: song.name,
    artists: song.artists
      .map(artist => artist.name)
      .join(", ")
      .trim(),
    album: song.album.name,
    source: "wy" as TMediaSource,
    imgId: song.album.picUrl.replace("https://", "").replace(".jpg", ""),
    duration: Math.floor(song.duration / 1000),
  }));
  return transformSongs;
}

async function officialFetch(id: string) {
  interface TApiRes {
    code: number;
    data: {
      url: string;
    }[];
  }

  const target_url = mediaBaseURL.wyOfficial;
  const res = await $fetch<TApiRes>(target_url, {
    method: "GET",
    params: {
      ids: `[${id}]`,
      br: 999000,
    },
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    },
  });
  if (res.code !== 200 || !res.data[0]?.url) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "获取歌曲链接失败" });
  }
  return { url: res.data[0].url, pay: false };
}

// async function officialFetch2(id: string) {
//   const baseUrl = mediaBaseURL.wyOfficial2;
//   const res = await fetch(`${baseUrl}${id}`, {
//     method: 'GET',
//     redirect: 'follow',
//   });
//   if (!res.ok) {
//     throw new TRPCError({ code: "BAD_REQUEST", message: "获取歌曲链接失败" });
//   } else if (res.url.replace(/^http:/, "https:") === "https://music.163.com/404") {
//     throw new TRPCError({ code: "BAD_REQUEST", message: defaultVipSign });
//   } else {
//     return {
//       url: res.url.replace(/^http:/, "https:"),
//       pay: false,
//     };
//   }
// }

async function vkeyFetch(id: string) {
  const songBaseURL = mediaBaseURL.wyVkey;
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
      id,
      quality: 4,
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

async function metingapiFetch(id: string) {
  const target_url = mediaBaseURL.wyMeting;
  const res = await fetch(`${target_url}${id}`, {
    method: "GET",
    redirect: "follow",
  }).then((res) => {
    if (res.url === `${target_url}${id}`)
      throw new TRPCError({ code: "BAD_REQUEST", message: "获取歌曲链接失败" });
    return res;
  });
  return { url: res.url, pay: true };
}

export const netease = createPlugin({
  name: "wy",
  alias: "网易云音乐",
  searchSongs: { fn: officialSearch, retryCount: 1 },
  getMusicUrl: [
    { fn: officialFetch, priority: 1, retryCount: 0 },
    // { fn: officialFetch2, priority: 0.9 },
    { fn: metingapiFetch, priority: 0.9, retryCount: 2 },
    { fn: vkeyFetch, priority: 0.8, retryCount: 2 },
  ],
});
