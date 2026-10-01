<template>
  <div
    class="flex h-svh w-full justify-center lg:grid lg:min-h-[600px] lg:grid-cols-2 xl:min-h-[800px]"
  >
    <div class="flex items-center justify-center py-12">
      <div class="mx-auto grid w-[350px] gap-6">
        <div class="grid gap-2 text-center">
          <h1 class="text-3xl font-bold">
            注册
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ SCHOOL_NAME }} 点歌系统
          </p>
          <p class="text-balance text-muted-foreground">
            注册<span class="mx-1 font-mono font-light tracking-tighter text-blue-700">SchoolFm</span>账号
          </p>
        </div>
        <AuthAnnouncement />
        <div class="grid gap-4">
          <form @submit.prevent="onSubmit">
            <FormField v-slot="{ componentField }" name="id">
              <FormItem v-auto-animate>
                <FormLabel>学号</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="StudentId" v-bind="componentField" />
                </FormControl>
                <FormDescription> 你的7位学号 </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="username">
              <FormItem v-auto-animate>
                <FormLabel>姓名</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Name" v-bind="componentField" />
                </FormControl>
                <FormDescription> 你的真实姓名 </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="displayName">
              <FormItem v-auto-animate>
                <FormLabel>昵称(可选)</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Alias" v-bind="componentField" />
                </FormControl>
                <FormDescription class="text-xs">
                  投稿歌曲时对外可选的昵称
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="password">
              <FormItem v-auto-animate>
                <FormLabel>密码</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Password" v-bind="componentField" />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ value, handleChange }" name="agreed">
              <FormItem class="flex flex-row items-start gap-x-3 space-y-0 rounded-md border p-4">
                <FormControl>
                  <Checkbox :model-value="value" @update:model-value="handleChange" />
                </FormControl>
                <div class="space-y-1 leading-none text-sm">
                  <FormLabel class="flex flex-wrap items-center gap-x-1">
                    我已阅读并同意
                    <NuxtLink to="/agreement" class="font-semibold underline underline-offset-4" target="_blank">
                      用户协议和隐私政策
                    </NuxtLink>
                    及
                    <NuxtLink to="/faq" class="font-semibold underline underline-offset-4" target="_blank">
                      常见问题
                    </NuxtLink>
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            </FormField>
            <br>
            <Button type="submit" class="w-full" :disabled="isPending || !values.agreed">
              <Icon v-if="isPending" name="lucide:loader-circle" class="mr-2 animate-spin" />
              注册
            </Button>
          </form>
        </div>
        <div class="mt-4 text-center text-sm">
          <p class="text-muted-foreground mb-2">
            相关问题请查看<NuxtLink to="https://ljk743121.github.io/soeDoc/guide/basic/auth.html" class="font-semibold underline underline-offset-4" target="_blank">
              注册
            </NuxtLink>和<NuxtLink to="https://ljk743121.github.io/soeDoc/guide/#%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98" class="font-semibold underline underline-offset-4" target="_blank">
              常见问题
            </NuxtLink>
            <span class="text-xs">外部链接</span>
          </p>
          <p class="text-muted-foreground">
            已有<span class="mx-1 font-mono font-light tracking-tighter text-blue-700">SchoolFm</span>账号？
            <NuxtLink to="/auth/login" class="font-semibold underline underline-offset-4">
              登录
            </NuxtLink>
          </p>
        </div>
      </div>
    </div>
    <div class="hidden items-center justify-center bg-muted lg:flex">
      <LogosCombined />
    </div>
  </div>
</template>

<script setup lang="ts">
import { vAutoAnimate } from "@formkit/auto-animate/vue";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import * as z from "zod";
import { pwRegex, SCHOOL_NAME } from "~~/constants";

const userStore = useUserStore();
const { $trpc } = useNuxtApp();

useSeoMeta({
  title: `账号注册`,
  description: `注册 ${SCHOOL_NAME} 点歌系统账号，使用学号注册后即可投稿歌曲到校园广播站。`,
  keywords: "注册,账号注册,用户注册,点歌系统注册,校园广播注册",
  ogTitle: `账号注册`,
  ogDescription: `注册 ${SCHOOL_NAME} 点歌系统账号，使用学号注册后即可投稿歌曲到校园广播站。`,
  ogUrl: "https://voszsy.penacony.cn/auth/register",
  robots: "noindex, follow",
});

useHead({
  title: "账号注册",
  link: [
    {
      rel: "canonical",
      href: "https://voszsy.penacony.cn/auth/register",
    },
  ],
});

if (userStore.loggedIn)
  navigateTo("/");
try {
  const isRegisterOpen = await $trpc.config.get.mutate("isRegisterOpen");
  if (isRegisterOpen === "false") {
    toast.error("注册已关闭");
    navigateTo("/auth/login");
  }
  await $trpc.user.tokenValidity.query();
  navigateTo("/");
} catch {}

const formSchema = toTypedSchema(
  z.object({
    id: z.string().length(7, "校园卡号为7位数字").regex(/\d+/, "输入必须为数字").trim(),
    username: z
      .string()
      .trim()
      .min(2, "最少为2个字符")
      .max(7, "最多为7个字符")
      .regex(/[一-龥]+/, "输入必须为汉字"),
    displayName: z.string().trim().min(1, "最少为1个字符").max(32, "最多为32个字符").optional(),
    password: z
      .string()
      .min(6, "最少为6个字符")
      .max(16, "最多为16个字符")
      .regex(pwRegex, "密码需包括至少1个字母,1个数字")
      .trim(),
    agreed: z.boolean().refine(val => val === true, {
      message: "请确认已阅读用户协议和隐私政策及常见问题",
    }),
  }),
);

const { handleSubmit, values } = useForm({
  validationSchema: formSchema,
});

const { mutate: login, isPending } = useMutation({
  mutationFn: $trpc.user.register.mutate,
  onSuccess: (res) => {
    useUserStore().login(res);
    toast.success("注册成功，正在登录");
    navigateTo("/");
  },
  onError: err => useErrorHandler(err),
});

const onSubmit = handleSubmit(async (values) => {
  login(values);
});
</script>
