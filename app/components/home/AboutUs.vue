<template>
  <ClientOnly>
    <template #fallback>
      <slot />
    </template>

    <Dialog v-model:open="isOpen">
      <DialogTrigger>
        <slot />
      </DialogTrigger>
      <DialogContent class="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle> 关于我们 </DialogTitle>
        </DialogHeader>

        <LogosCombined class="mx-auto w-full lg:max-w-2xl" />
        <section class="prose">
          <p>
            <span class="mx-1 font-mono font-light tracking-tighter text-blue-700">SchoolFm</span>
            是一个基于 Nuxt & Vue 开发的校园点歌管理播放一体化自动化系统，包含歌曲投稿，歌曲审核，智能排歌分配，智能播放等功能。
            现用于<b>实验之声广播站</b>的点歌管理播放。
          </p>
          <p>
            这个项目的代码是开源的，你可以在
            <NuxtLink
              to="https://github.com/ljk743121/SchoolFm"
              class="font-semibold underline underline-offset-4"
            >
              <span>这里</span>
            </NuxtLink>
            查看源代码。期待各位同学的反馈！
          </p>
          <p>
            该项目的使用文档以及开发文档可在
            <NuxtLink
              to="https://ljk743121.github.io/soeDoc/"
              class="font-semibold underline underline-offset-4"
            >
              <span>这里</span>
            </NuxtLink>
            查看。
          </p>
        </section>

        <section>
          <p>
            致谢：
            <NuxtLink
              to="https://qijieya.cn/"
              class="font-semibold underline underline-offset-4"
            >
              <span>锦木祈杰</span>
            </NuxtLink>
            提供的二级域名
          </p>
        </section>

        <section>
          <p>
            <NuxtLink
              to="mailto:ljk743121@outlook.com"
              class="underline underline-offset-4"
            >
              <span>联系作者</span>
            </NuxtLink>
          </p>
        </section>

        <section>
          <p>
            项目贡献者：
          </p>
          <NuxtLink
            to="https://github.com/ljk743121/SchoolFm/graphs/contributors"
            target="_blank"
            class="block"
          >
            <NuxtImg
              src="https://contrib.rocks/image?repo=ljk743121/SchoolFm"
              alt="Contributors"
              class="mx-auto w-1/2"
              @error="contribError = true"
            />
          </NuxtLink>
          <p v-if="contribError" class="text-xs text-muted-foreground">
            贡献者图片加载失败，可点击
            <NuxtLink
              to="https://github.com/ljk743121/SchoolFm/graphs/contributors"
              target="_blank"
              class="font-semibold underline underline-offset-4"
            >
              此处
            </NuxtLink>
            查看。
          </p>
        </section>

        <section>
          <p class="mb-2">
            最近提交：
          </p>
          <ScrollArea class="h-[200px] w-full max-w-full rounded-md border px-3 py-2">
            <div v-if="isLoading" class="text-sm text-muted-foreground">
              加载中...
            </div>
            <div v-else-if="!commits?.length" class="text-sm text-muted-foreground">
              暂无提交记录
            </div>
            <div v-else class="w-full max-w-full space-y-2">
              <NuxtLink
                v-for="commit in commits"
                :key="commit.sha"
                :to="commit.html_url"
                target="_blank"
                class="flex w-full max-w-full min-w-0 items-start gap-2 rounded-md p-1 transition-colors hover:bg-muted"
              >
                <Avatar v-if="commit.author?.avatar_url" class="size-6 shrink-0">
                  <AvatarImage :src="commit.author.avatar_url" :alt="commit.author.login" />
                  <AvatarFallback>{{ commit.commit.author.name.slice(0, 1) }}</AvatarFallback>
                </Avatar>
                <div class="min-w-0 w-0 flex-1">
                  <p class="max-w-full truncate text-sm font-medium">
                    {{ commit.commit.message.split('\n')[0] }}
                  </p>
                  <p class="max-w-full truncate text-xs text-muted-foreground">
                    {{ commit.commit.author.name }} · {{ formatDate(commit.commit.author.date) }}
                  </p>
                </div>
              </NuxtLink>
            </div>
          </ScrollArea>
        </section>

        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">Made by
            <NuxtLink
              to="https://github.com/ljk743121"
              class="font-semibold underline underline-offset-4"
            >@Ljk743121</NuxtLink>
            and other contributors</span>
          <div class="flex gap-2">
            <NuxtLink to="https://github.com/ljk743121/SchoolFm" target="_blank">
              <Button variant="outline" size="icon">
                <Icon name="lucide:github" />
              </Button>
            </NuxtLink>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </ClientOnly>
</template>

<script setup lang="ts">
interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: {
    avatar_url: string;
    html_url: string;
    login: string;
  } | null;
}

const isOpen = ref(false);
const { data: commits, status, execute } = useFetch<GitHubCommit[]>(
  "https://api.github.com/repos/ljk743121/SchoolFm/commits?per_page=30",
  {
    key: "github-commits",
    default: () => [],
    lazy: true,
    server: false,
    immediate: false,
  },
);

watch(isOpen, (open) => {
  if (open) {
    execute();
  }
});

const isLoading = computed(() => status.value === "pending");
const contribError = ref(false);

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
</script>
