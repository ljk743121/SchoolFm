<template>
  <div class="flex min-h-[calc(100svh-4rem)] flex-col">
    <!-- 顶部工具栏：统计与操作入口 -->
    <header class="sticky top-0 z-30 min-h-16 shrink-0 border-b bg-background p-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="grid grid-cols-3 gap-3 sm:flex">
          <Card
            class="cursor-pointer transition-colors hover:bg-accent"
            @click="navigateToApproved"
          >
            <CardHeader class="pb-2">
              <CardDescription>已通过</CardDescription>
              <CardTitle class="text-2xl">
                {{ stats?.approved ?? "-" }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-xs text-muted-foreground">
                可供排歌
              </p>
            </CardContent>
          </Card>
          <Card
            class="cursor-pointer transition-colors hover:bg-accent"
            @click="navigateToDropped"
          >
            <CardHeader class="pb-2">
              <CardDescription>落选</CardDescription>
              <CardTitle class="text-2xl">
                {{ stats?.dropped ?? "-" }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-xs text-muted-foreground">
                被舍弃歌曲
              </p>
            </CardContent>
          </Card>
          <Card
            class="cursor-pointer transition-colors hover:bg-accent"
            @click="navigateToReview"
          >
            <CardHeader class="pb-2">
              <CardDescription>未审核</CardDescription>
              <CardTitle class="text-2xl">
                {{ stats?.pending ?? "-" }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-xs text-muted-foreground">
                待审核歌曲
              </p>
            </CardContent>
          </Card>
          <Card
            class="cursor-pointer transition-colors hover:bg-accent"
            @click="navigateToDropped"
          >
            <CardHeader class="pb-2">
              <CardDescription>错过未播</CardDescription>
              <CardTitle class="text-2xl">
                {{ stats?.missed ?? "-" }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-xs text-muted-foreground">
                错过未播歌曲
              </p>
            </CardContent>
          </Card>
          <Card
            class="cursor-pointer transition-colors hover:bg-accent"
            @click="navigateToDropped"
          >
            <CardHeader class="pb-2">
              <CardDescription>播放失败</CardDescription>
              <CardTitle class="text-2xl">
                {{ stats?.failed ?? "-" }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-xs text-muted-foreground">
                尝试播放但未成功的歌曲
              </p>
            </CardContent>
          </Card>
        </div>

        <div class="flex flex-wrap gap-2">
          <Sheet>
            <SheetTrigger as-child>
              <Button variant="outline" class="flex-1 sm:flex-none">
                <Icon name="lucide:settings" class="mr-2 h-4 w-4" />
                排歌设置
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>排歌设置</SheetTitle>
                <SheetDescription>
                  选择日期范围并执行排歌
                </SheetDescription>
              </SheetHeader>
              <div class="mt-6">
                <AdminSongArrangeControls
                  v-model:calendar-value="calendarValue"
                  v-model:song-count="songCount"
                  :requirement-list="requirementList"
                  :can-arrange="canArrange"
                  :is-pending="isPending"
                  :arrange-result="arrangeResult"
                  @arrange="onArrange"
                />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger as-child>
              <Button variant="outline" class="flex-1 sm:flex-none">
                <Icon name="lucide:download" class="mr-2 h-4 w-4" />
                下载数据
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>下载数据</SheetTitle>
                <SheetDescription>
                  选择日期区段并导出 CSV
                </SheetDescription>
              </SheetHeader>
              <div class="mt-6">
                <AdminSongDownloadControls
                  v-model:copy-value="copyValue"
                  :arrangement-list="arrangementList"
                  @copy-all="copyAllSongs(arrangementList)"
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>

    <!-- 日期侧边栏 + 主内容区 -->
    <div class="flex flex-1 flex-col overflow-hidden md:flex-row">
      <!-- 侧边日期列表 -->
      <aside class="border-b bg-sidebar md:h-full md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <!-- 移动端：横向滚动日期选择 -->
        <div v-if="arrangementList && arrangementList.length > 0" class="flex gap-1 overflow-x-auto p-2 md:hidden">
          <Button
            v-for="(day, index) in arrangementList"
            :key="index"
            :variant="selectedDayIndex === index ? 'default' : 'outline'"
            size="sm"
            @click="selectedDayIndex = index"
          >
            {{ day.date }}
          </Button>
        </div>
        <div v-else class="p-4 text-sm text-muted-foreground md:hidden">
          暂无排歌数据
        </div>

        <!-- 桌面端：纵向列表 -->
        <ScrollArea class="hidden h-full md:block">
          <div class="flex flex-col gap-1 p-2">
            <Button
              v-for="(day, index) in arrangementList"
              :key="index"
              :variant="selectedDayIndex === index ? 'default' : 'ghost'"
              class="w-full justify-start"
              @click="selectedDayIndex = index"
            >
              <Icon
                v-if="selectedDayIndex === index"
                name="lucide:chevron-right"
                class="mr-2 h-4 w-4"
              />
              {{ day.date }}
            </Button>
          </div>
          <div v-if="!arrangementList?.length" class="p-4 text-sm text-muted-foreground">
            暂无排歌数据
          </div>
        </ScrollArea>
      </aside>

      <!-- 主内容区 -->
      <main class="flex-1 overflow-y-auto p-4">
        <div v-if="selectedDay" class="mx-auto max-w-4xl">
          <Card>
            <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
              <div class="min-w-0">
                <CardTitle class="text-lg font-semibold">
                  {{ selectedDay.date }}
                </CardTitle>
                <CardDescription>
                  {{ selectedDay.songs.length }} 首歌曲
                </CardDescription>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="sm" @click="copySongInfo(selectedDay)">
                  <Icon name="lucide:download" class="mr-1 h-4 w-4" />
                  下载 CSV
                </Button>
                <LazyAdminSongDeleteArrangement
                  v-if="userStore.permissions.includes('deleteArrangement')"
                  :date="selectedDay.date"
                />
              </div>
            </CardHeader>
            <CardContent>
              <ul v-if="selectedDay.songs.length" class="flex flex-col gap-3">
                <li v-for="song in selectedDay.songs" :key="song.id">
                  <LazySongCard :song="song" is-arrangement type="review" />
                </li>
              </ul>
              <p v-else class="py-8 text-center text-sm text-muted-foreground">
                当日暂无歌曲
              </p>
            </CardContent>
          </Card>
        </div>
        <div v-else class="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Icon name="lucide:calendar-x" class="h-10 w-10 opacity-50" />
          <p>暂无排歌数据</p>
          <p class="text-sm">
            点击上方“排歌设置”选择日期并执行排歌
          </p>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DateRange } from "reka-ui";
import type { RouterOutput } from "~~/types";
import { getLocalTimeZone, startOfWeek, today } from "@internationalized/date";

definePageMeta({
  layout: "admin",
});

const { $trpc } = useNuxtApp();
const userStore = useUserStore();
const router = useRouter();

const { data: arrangementList } = useQuery({
  queryFn: () => $trpc.arrangements.list.query(),
  queryKey: ["arrangements.list"],
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
});

const { data: stats } = useQuery({
  queryFn: () => $trpc.arrangements.stats.query(),
  queryKey: ["arrangements.stats"],
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
});

const selectedDayIndex = ref(0);

const selectedDay = computed(() => {
  if (!arrangementList.value?.length)
    return null;
  return arrangementList.value[selectedDayIndex.value] ?? arrangementList.value[0];
});

watch(arrangementList, (list) => {
  if (list && selectedDayIndex.value >= list.length)
    selectedDayIndex.value = 0;
});

function navigateToReview() {
  if (!userStore.permissions.includes("review")) {
    toast.error("您没有审核歌曲的权限");
    return;
  }
  if (stats.value?.pending && stats.value.pending > 0)
    router.push("/admin/songs/review");
}

function navigateToApproved() {
  if (!userStore.permissions.includes("manualArrange")) {
    toast.error("您没有排歌的权限");
    return;
  }
  router.push("/admin/songs/manualArrange");
}

function navigateToDropped() {
  router.push("/admin/songs");
}

function downloadCsv(csvContent: string, date?: string) {
  try {
    const dateStr = date || new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/\//g, "-");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `songs_${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("正在下载 CSV 文件...");
  } catch (e: any) {
    if (e.message)
      toast.error(e.message);
    else toast.error(e.toString());
  }
}

async function copySongInfo(day: RouterOutput["arrangements"]["list"][0]) {
  if (!day.songs.length) {
    toast.error("排歌表为空");
    return;
  }

  const csvHeader = "id,name,creator,source,songID\n";
  let csvContent = csvHeader;
  for (const song of day.songs) {
    csvContent += `"${song.id}","${song.name}","${song.creator}","${song.source}","${song.songId}"\n`;
  }
  downloadCsv(csvContent, day.date);
}

const _start = startOfWeek(today(getLocalTimeZone()).add({ weeks: 1 }), "zh-CN");
const _end = _start.add({ days: 4 });

const calendarValue = ref({
  start: _start,
  end: _end,
}) as Ref<DateRange>;

const copyValue = ref({
  start: _start,
  end: _end,
}) as Ref<DateRange>;

async function copyAllSongs(list: RouterOutput["arrangements"]["list"] | undefined) {
  if (!list) {
    toast.error("排歌表为空");
    return;
  }
  const dateRange = copyValue.value;
  if (!dateRange || !dateRange.start || !dateRange.end) {
    toast.error("请选择有效的时间段");
    return;
  }
  const selectedDays = arrangementList.value?.filter((day) => {
    const dayDate = new Date(day.date);
    const startDate = dateRange.start!.toDate(getLocalTimeZone());
    const endDate = dateRange.end!.toDate(getLocalTimeZone());
    return dayDate >= startDate && dayDate <= endDate;
  });
  if (!selectedDays || selectedDays.length === 0) {
    toast.error("所选时间段内没有歌曲");
    return;
  }
  const csvHeader = "id,name,creator,source,songID\n";
  let csvContent = csvHeader;

  for (const day of selectedDays) {
    for (const song of day.songs) {
      csvContent += `"${song.id}","${song.name}","${song.creator}","${song.source}","${song.songId}"\n`;
    }
  }
  downloadCsv(csvContent);
}

const requirementList = computed<
  {
    label: string;
    value: boolean;
  }[]
>(() => {
  return [
    {
      label: "选择时间段",
      value: calendarValue.value.start !== undefined && calendarValue.value.end !== undefined,
    },
  ];
});

const canArrange = computed(() => requirementList.value.every(x => x.value));

const songCount = ref(0);

const arrangeResult = ref<RouterOutput["arrangements"]["arrange"] | null>(null);

const queryClient = useQueryClient();
const { mutate: arrange, isPending } = useMutation({
  mutationFn: $trpc.arrangements.arrange.mutate,
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ["arrangements.list"] });
    queryClient.invalidateQueries({ queryKey: ["arrangements.stats"] });
    arrangeResult.value = data;
    selectedDayIndex.value = 0;
    if (data.conflicts.length === 0 && data.droppedCount === 0) {
      toast.success("排歌成功！");
    } else {
      const evicted = data.evictedCount > 0 ? `，回退 ${data.evictedCount} 首普通歌曲` : "";
      toast.warning(`排歌完成：${data.placedCount} 首已安排，${data.droppedCount} 首被舍弃，${data.conflicts.length} 个期望日期冲突${evicted}`);
    }
  },
  onError: err => useErrorHandler(err),
});

function onArrange() {
  arrange({
    start: calendarValue.value.start!.toString(),
    end: calendarValue.value.end!.toString(),
    songCount: songCount.value,
  });
}
</script>
