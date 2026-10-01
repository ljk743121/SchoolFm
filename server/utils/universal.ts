import { TRPCError } from "@trpc/server";
import { consola } from "consola";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { configs, users } from "../db/schema";
import { cacheGet, cacheSet } from "./redis";

const CONFIG_CACHE_KEY = "configs:all";
const CONFIG_PREFIX = "config:";

export async function getConfig(key: string) {
  const cacheKey = `${CONFIG_PREFIX}${key}`;
  const cached = await cacheGet(cacheKey);

  if (cached) {
    return cached;
  }

  const value = await db.query.configs.findFirst({
    where: eq(configs.key, key),
  });

  if (value?.value) {
    await cacheSet(cacheKey, value.value, { EX: 86400 });
  }

  return value?.value;
}

export async function getAllConfigs() {
  const cached = await cacheGet(CONFIG_CACHE_KEY);

  if (cached) {
    const configMap = JSON.parse(cached) as Record<string, string>;
    return Object.entries(configMap).map(([key, value]) => ({ key, value }));
  }

  const values = await db.query.configs.findMany();

  const configMap = Object.fromEntries(values.map(v => [v.key, v.value]));
  await cacheSet(CONFIG_CACHE_KEY, JSON.stringify(configMap), { EX: 86400 });

  return values;
}

export async function updateConfig(key: string, value: string) {
  const config = await db.query.configs.findFirst({
    where: eq(configs.key, key),
  });
  if (!config) {
    throw new TRPCError({ code: "NOT_FOUND", message: "更新失败" });
  } else {
    await db.update(configs).set({
      value: value.toString(),
    }).where(eq(configs.key, config.key));
  }

  const cacheKey = `${CONFIG_PREFIX}${key}`;
  await cacheSet(cacheKey, value.toString(), { EX: 86400 });

  const allConfigs = await db.query.configs.findMany();
  const configMap = Object.fromEntries(allConfigs.map(v => [v.key, v.value]));
  await cacheSet(CONFIG_CACHE_KEY, JSON.stringify(configMap), { EX: 86400 });
}

export async function getUserDetailById(id: string) {
  if (!id)
    throw new TRPCError({ code: "BAD_REQUEST", message: "用户ID不能为空" });
  const detail = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  if (!detail)
    throw new TRPCError({ code: "NOT_FOUND", message: "查询失败" });
  return detail;
}

const blockWordsApi = "https://uapis.cn/api/v1/text/profanitycheck";
async function detectBlockWord(content: string) {
  consola.info("Using blockWordsApi");
  interface BlockWord {
    status: string;
    forbidden_words: string[];
  }
  const res = await $fetch<BlockWord>(blockWordsApi, {
    method: "POST",
    body: {
      text: content,
    },
    parseResponse(responseText) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    },
  });
  return res.forbidden_words ?? [];
}

export async function hasBlockWord(content: string) {
  const words = content.match(/\S+/g) || [];
  const blockWordsList: string[] = [];

  if (words.length > 0) {
    const blockWords = await db.query.blockWords.findMany();
    const blockWordSet = new Set(blockWords.map(bw => bw.word));
    for (const word of words) {
      if (blockWordSet.has(word)) {
        blockWordsList.push(word);
      } else {
        for (const bw of blockWordSet) {
          if (word.includes(bw)) {
            blockWordsList.push(bw);
          }
        }
      }
    }
    if (blockWordsList.length === 0 && (await getConfig("blockWordsApi")) === "true") {
      const externalBlockWords = await detectBlockWord(content);
      return [...blockWordsList, ...externalBlockWords];
    } else {
      return blockWordsList;
    }
  } else {
    return blockWordsList;
  }
}
