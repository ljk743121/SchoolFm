/**
 * 用真实 `server/trpc/routers/arrangements.ts` 的 router 构造 tRPC caller。
 *
 * 说明：`adminProcedure` + `requirePermission(["arrange"])` 只检查 `ctx.user` 是否存在、
 * `permissions` 是否包含 login/admin/arrange，不查数据库；因此这里从 dev 库取一个真实
 * admin 用户补足权限即可，**不会** import `server/trpc/context.ts`（那里依赖 Nuxt 全局
 * `getRequestHeader`，脚本环境不可用）。
 */
import { db } from "~~/server/db";
import { arrangementsRouter } from "~~/server/trpc/routers/arrangements";

export async function createArrangeCaller() {
  const allUsers = await db.query.users.findMany();
  const base = allUsers.find(user => user.permissions.includes("admin")) ?? allUsers[0];
  if (!base)
    throw new Error("dev 库中没有用户，无法构造 tRPC 调用上下文");
  const user = {
    ...base,
    permissions: [...new Set([...base.permissions, "login" as const, "admin" as const, "arrange" as const])],
  };
  type CallerContext = Parameters<typeof arrangementsRouter.createCaller>[0];
  return arrangementsRouter.createCaller({ user } as CallerContext);
}
