import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~~/server/db";
import { announcement } from "~~/server/db/schema";
import { cacheDel, cacheGet, cacheSet } from "~~/server/utils/redis";
import { adminProcedure, protectedProcedure, publicProcedure, requirePermission, router } from "../trpc";

const cacheKey = "announcement:listSafe";
const cacheKeyAdmin = "announcement:listAdmin";
const cacheKeyLatestPublic = "announcement:latestPublic";

export const announcementRouter = router({
  create: adminProcedure
    .use(requirePermission(["announcement"]))
    .input(
      z.object({
        markdown: z.string().min(1),
        visible: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await db.insert(announcement).values({
        markdown: input.markdown,
        creatorId: ctx.user.id,
        creatorName: ctx.user.displayName || ctx.user.name,
        visible: input.visible,
      });
      await cacheDel(cacheKey);
      await cacheDel(cacheKeyAdmin);
    }),

  list: adminProcedure.use(requirePermission(["announcement"])).query(async () => {
    return await db.query.announcement.findMany({
      orderBy: desc(announcement.createdAt),
    });
  }),

  listSafe: protectedProcedure.query(async () => {
    const cachedList = await cacheGet(cacheKey);
    if (cachedList) {
      if (cachedList) {
        return JSON.parse(cachedList);
      }
    }
    const list = await db.query.announcement.findMany({
      where: eq(announcement.visible, "all"),
      orderBy: desc(announcement.createdAt),
      columns: {
        createdAt: true,
        markdown: true,
        creatorName: true,
        type: true,
      },
    });
    await cacheSet(cacheKey, JSON.stringify(list), { EX: 604800 });
    return list;
  }),

  latestPublic: publicProcedure.query(async () => {
    const cachedLatest = await cacheGet(cacheKeyLatestPublic);
    if (cachedLatest) {
      return JSON.parse(cachedLatest);
    }
    const latest = await db.query.announcement.findFirst({
      where: eq(announcement.visible, "public"),
      orderBy: desc(announcement.createdAt),
      columns: {
        createdAt: true,
        markdown: true,
      },
    });
    await cacheSet(cacheKeyLatestPublic, JSON.stringify(latest ?? null), { EX: 604800 });
    return latest ?? null;
  }),

  listAdmin: adminProcedure.query(async () => {
    const cachedList = await cacheGet(cacheKeyAdmin);
    if (cachedList) {
      if (cachedList) {
        return JSON.parse(cachedList);
      }
    }
    const list = await db.query.announcement.findMany({
      where: eq(announcement.visible, "admin"),
      orderBy: desc(announcement.createdAt),
      columns: {
        createdAt: true,
        markdown: true,
        creatorName: true,
        type: true,
      },
    });
    await cacheSet(cacheKeyAdmin, JSON.stringify(list), { EX: 604800 });
    return list;
  }),

  remove: adminProcedure
    .use(requirePermission(["announcement"]))
    .input(z.number())
    .mutation(async ({ input }) => {
      await db.delete(announcement).where(eq(announcement.id, input));
      await cacheDel(cacheKey);
      await cacheDel(cacheKeyAdmin);
    }),

  update: adminProcedure
    .use(requirePermission(["announcement"]))
    .input(
      z.object({
        id: z.number(),
        markdown: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const updateList = await db.query.announcement.findFirst({
        where: eq(announcement.id, input.id),
      });
      if (!updateList)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.id !== updateList.creatorId)
        throw new TRPCError({ code: "FORBIDDEN" });
      await db
        .update(announcement)
        .set({
          markdown: input.markdown,
        })
        .where(eq(announcement.id, input.id));
      await cacheDel(cacheKey);
      await cacheDel(cacheKeyAdmin);
      await cacheDel(cacheKeyLatestPublic);
    }),

  getHash: protectedProcedure.query(async () => {
    const latestAnnouncements = await db.query.announcement.findMany({
      where: eq(announcement.visible, "all"),
      orderBy: desc(announcement.createdAt),
      columns: {
        createdAt: true,
        id: true,
      },
    });

    if (!latestAnnouncements) {
      return { hash: "" };
    }

    const combinedString = latestAnnouncements.map(ann =>
      `${ann.id}-${ann.createdAt.toISOString()}`,
    ).join("|");
    const hash = createHash("sha256").update(combinedString).digest("hex");
    return { hash };
  }),
});
