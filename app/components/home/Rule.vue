<template>
  <ClientOnly>
    <template #fallback>
      <slot />
    </template>

    <Dialog>
      <DialogTrigger as-child>
        <slot />
      </DialogTrigger>
      <DialogContent class="max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader class="px-6 pt-6">
          <div class="flex items-center gap-2">
            <Icon name="lucide:scroll-text" class="h-5 w-5 text-primary" />
            <DialogTitle>投稿规则</DialogTitle>
          </div>
          <DialogDescription>
            投稿前请仔细阅读，确保你的歌曲要求。
            <br>
            请先阅读<NuxtLink to="/faq" class="font-medium text-primary underline underline-offset-2">
              <strong>常见问题</strong>
            </NuxtLink>
            再阅读该规则。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea class="max-h-[60vh] px-6 pb-6" type="auto">
          <Alert class="mb-5 border-primary/30 bg-primary/5">
            <AlertTitle class="flex items-center gap-2">
              <Icon name="lucide:info" class="size-4" />
              投稿须知
            </AlertTitle>
            <AlertDescription class="text-sm text-foreground">
              点击"提交投稿"即表示你已阅读并同意以下规则及
              <NuxtLink to="/agreement" class="font-medium text-primary underline underline-offset-2">
                用户协议和隐私政策
              </NuxtLink>。
            </AlertDescription>
          </Alert>

          <div class="space-y-5">
            <section>
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon name="lucide:music" class="h-4 w-4 text-primary" />
                歌曲要求
              </div>
              <ul class="space-y-2 text-sm text-muted-foreground">
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>歌曲内容务必积极向上、充满正能量，适合在校园内播放。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>歌曲时长需在 30 秒至 10 分钟之间。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>深圳实验广播站有权对歌曲进行筛选、审核不通过或删除。</span>
                </li>
              </ul>
            </section>

            <section>
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon name="lucide:radio" class="h-4 w-4 text-primary" />
                音源与播放
              </div>
              <ul class="space-y-2 text-sm text-muted-foreground">
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>
                    支持音源优先级：<strong>网易云音乐</strong>（推荐）> BiliBili > QQ音乐。
                  </span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>QQ 音乐 VIP 歌曲可能只能播放片段，投稿前请先试听确认。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>BiliBili 因技术原因加载的是视频资源，响应时间可能较慢，请耐心等待。</span>
                </li>
              </ul>
            </section>

            <section>
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon name="lucide:send" class="h-4 w-4 text-primary" />
                投稿方式
              </div>
              <ul class="space-y-2 text-sm text-muted-foreground">
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>投稿时可选择实名、匿名或昵称显示。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>可选择期望播放日期，系统会优先安排；不选择则由系统自由分配。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>私密留言仅审核员可见，公开留言将在主页面展示。</span>
                </li>
              </ul>
            </section>

            <section>
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon name="lucide:list-checks" class="h-4 w-4 text-primary" />
                审核与排歌
              </div>
              <ul class="space-y-2 text-sm text-muted-foreground">
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>投稿需经后台人员审核并排歌后才会播放。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>排歌优先级：期望日期优先，未填写期望日期的歌曲按投稿时间先后安排。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>每日播放总时长上限为 45 分钟，若日期已满或不可用，系统会尝试调整到最近的可用日期。</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">•</span>
                  <span>最终歌单仅供参考，实际播出顺序以广播站安排为准。</span>
                </li>
              </ul>
            </section>

            <section>
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon name="lucide:rotate-ccw" class="h-4 w-4 text-primary" />
                次数与限制
              </div>
              <div class="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                默认每周最多投稿 <strong class="text-foreground">3</strong> 次；每周或距上次投稿满 5 天后重置次数。
                投稿前请确认当前处于开放投稿时间段内。
              </div>
            </section>
          </div>

          <div class="mt-6 flex flex-wrap items-center gap-3">
            <Badge variant="secondary" class="gap-1">
              <Icon name="lucide:help-circle" class="h-3 w-3" />
              有疑问？
            </Badge>
            <NuxtLink to="/faq" class="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80">
              查看常见问题
            </NuxtLink>
            <span class="text-muted-foreground">|</span>
            <NuxtLink to="https://ljk743121.github.io/soeDoc/guide/" target="_blank" rel="noopener noreferrer" class="text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
              查看使用说明
            </NuxtLink>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  </ClientOnly>
</template>
