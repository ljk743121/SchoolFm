<template>
  <div
    class="flex h-svh w-full justify-center lg:grid lg:min-h-[600px] lg:grid-cols-2 xl:min-h-[800px]"
  >
    <div class="flex items-center justify-center py-12">
      <div class="mx-auto grid w-[350px] gap-6">
        <div class="grid gap-2 text-center">
          <h1 class="text-3xl font-bold">
            登录
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ SCHOOL_NAME }} 点歌系统
          </p>
          <p class="text-balance text-muted-foreground">
            使用<span class="mx-1 font-mono font-light tracking-tighter text-blue-700">SchoolFm</span>账号登录
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
            <FormField v-slot="{ componentField }" name="password">
              <FormItem v-auto-animate>
                <FormLabel>密码</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Password" v-bind="componentField" />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <br>
            <Button type="submit" class="w-full" :disable="isPending">
              <Icon v-if="isPending" name="lucide:loader-circle" class="mr-2 animate-spin" />
              登录
            </Button>
          </form>
        </div>
        <div class="mt-4 text-center text-sm">
          <p class="text-muted-foreground">
            没有<span class="mx-1 font-mono font-light tracking-tighter text-blue-700">SchoolFm</span>账号？
            <NuxtLink to="/auth/register" class="text-primary">
              注册
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
  title: `用户登录`,
  description: `登录 ${SCHOOL_NAME} 点歌系统 | SchoolFm`,
  keywords: "登录,用户登录,点歌系统登录,校园广播登录",
  ogTitle: `用户登录`,
  ogUrl: "https://voszsy.penacony.cn/auth/login",
  robots: "noindex, follow",
});

useHead({
  title: `登录`,
  link: [
    {
      rel: "canonical",
      href: "https://voszsy.penacony.cn/auth/login",
    },
  ],
  meta: [
    { name: "description", content: `${SCHOOL_NAME} 点歌系统 | SchoolFm` },
    { name: "keywords", content: `点歌系统,登录,用户登录,校园广播登录` },
  ],
});

if (userStore.loggedIn)
  navigateTo("/");
try {
  await $trpc.user.tokenValidity.query();
  navigateTo("/");
} catch {}

const formSchema = toTypedSchema(
  z.object({
    id: z.string().length(7, "校园卡号为7位数字").regex(/\d+/, "输入必须为数字").trim(),
    password: z
      .string()
      .min(6, "最少为6个字符")
      .max(16, "最多为16个字符")
      .regex(pwRegex, "密码需包括至少1个字母,1个数字")
      .trim(),
  }),
);

const { handleSubmit } = useForm({
  validationSchema: formSchema,
});

const { mutate: login, isPending } = useMutation({
  mutationFn: $trpc.user.login.mutate,
  onSuccess: (res) => {
    useUserStore().login(res);
    toast.success("登录成功");
    navigateTo("/");
  },
  onError: err => useErrorHandler(err),
});

const onSubmit = handleSubmit(async (values) => {
  login(values);
});
</script>
