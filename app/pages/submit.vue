<!-- refactored by Kimi-K2.7-Coder -->
<template>
  <div class="mx-auto max-w-6xl p-4 md:p-6">
    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          歌曲投稿
        </h1>
        <p class="text-muted-foreground">
          搜索并选择一首歌曲，填写投稿信息后提交
        </p>
      </div>
      <Button variant="outline" size="icon" class="shrink-0" @click.prevent="navigateTo('/')">
        <Icon name="lucide:arrow-left" class="h-4 w-4" />
      </Button>
    </div>

    <!-- Rules -->
    <Alert class="mb-6">
      <AlertTitle class="flex items-center gap-2">
        <Icon name="lucide:info" class="size-4" />
        投稿前请确认
      </AlertTitle>
      <AlertDescription>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li class="text-destructive">
            已阅读投稿规则和<NuxtLink to="/faq" class="text-blue-600 hover:underline">
              <strong>常见问题</strong>
            </NuxtLink>,其中包含了投稿流程和具体排歌逻辑。
          </li>
          <li>检查是否已有相同歌曲</li>
          <li>选择合适的音乐源</li>
          <li>最好选择网易云音乐，BiliBili其次，QQ音乐最后选择(若QQ音乐无VIP可优先于BillBili)。</li>
          <li>QQ音乐有时候无法获取完整VIP歌曲，若需投稿请播放确认是否完整。</li>
          <li>BiliBili风控较为严格，有时候无法请求，请等待一段时间或联系管理员</li>
          <li><span class="text-destructive">注意：</span>切换歌曲来源后，点击搜索按钮可使用新来源重新搜索。</li>
        </ul>
      </AlertDescription>
    </Alert>

    <Alert class="mb-6">
      <AlertTitle class="flex items-center gap-2">
        <Icon name="lucide:info" class="size-4" />
        投稿Tips
      </AlertTitle>
      <AlertDescription>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li><strong>想尽快播：</strong>期望日填未满未锁定的日期，尽量早点投稿（特别是长歌曲），排序权重投稿时间很重要。</li>
          <li><strong>别都挤同一天：</strong>期望日尽量错开，避开已满的日期。</li>
          <li><strong>填未来期望日就按未来处理：</strong>系统只会在该日及之后考虑，若不能排歌不会提前安排</li>
          <li><strong>不填期望日会不确定：</strong>自由歌最后按剩余容量排，通常更晚，但短歌可能会提前播放。</li>
          <li><strong>落选不等于删除：</strong>一般会回到待排池，可以调整期望日或等下一次排歌。</li>
        </ul>
        详细内容请查看常见问题
      </AlertDescription>
    </Alert>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Search Panel -->
      <Card class="flex flex-col">
        <CardHeader>
          <div class="flex items-center gap-2">
            <Icon name="lucide:search" class="text-primary" size="20" />
            <CardTitle>搜索歌曲</CardTitle>
          </div>
          <CardDescription>选择来源并输入关键词搜索，可获取最多15首。</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <div class="flex flex-col gap-3 sm:flex-row">
            <FormField v-slot="{ componentField }" name="source">
              <FormItem v-auto-animate class="w-full sm:w-[160px]">
                <FormControl>
                  <Select v-bind="componentField">
                    <SelectTrigger>
                      <SelectValue placeholder="请选择来源" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="(source, index) in musicSources" :key="index" :value="source.value">
                        {{ source.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <div class="flex w-full items-center gap-2">
              <Input
                id="search"
                v-model="SearchInput"
                type="text"
                placeholder="输入歌曲名或歌手名"
                :disabled="isPending || songFetching"
                class="grow"
                @keyup.enter="onSearch"
              />
              <Button :disabled="isPending || songFetching || submitDisabled" @click.prevent="onSearch">
                <Icon v-if="songFetching" name="lucide:loader-circle" class="mr-2 animate-spin" size="16" />
                搜索
              </Button>
            </div>
          </div>

          <!-- Scrollable Results -->
          <template v-if="SearchKey.trim()">
            <ScrollArea v-if="!songFetching && songsList && songsList.length" class="h-[340px] rounded-md border">
              <div class="p-2">
                <div
                  v-for="songInfo in songsList"
                  :key="songInfo.id"
                  class="group relative flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/60"
                  :class="{ 'bg-primary/10 hover:bg-primary/10': selectedSong.songId === songInfo.id }"
                >
                  <Avatar class="size-12 shrink-0 rounded">
                    <NuxtImg
                      :src="getImgUrl(songInfo.imgId, songInfo.source)"
                      class="object-cover"
                      :alt="songInfo.name"
                      loading="lazy"
                    />
                    <AvatarFallback>
                      <Icon name="lucide:music" size="20" />
                    </AvatarFallback>
                  </Avatar>

                  <div class="min-w-0 flex-1 cursor-pointer" @click="handleSelectSong(songInfo)">
                    <p class="truncate font-medium">
                      {{ songInfo.name }}
                    </p>
                    <p class="truncate text-sm text-muted-foreground">
                      {{ songInfo.artists }}
                    </p>
                    <div class="mt-1 flex items-center gap-2">
                      <Badge variant="outline" class="text-xs">
                        {{ getMusicSourceName(songInfo.source) }}
                      </Badge>
                      <span class="text-xs text-muted-foreground">
                        {{ formatDuration(songInfo.duration) }}
                      </span>
                    </div>
                  </div>

                  <div class="flex shrink-0 flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      :disabled="submitDisabled"
                      @click.prevent="handlePlaySong(songInfo)"
                    >
                      <Icon name="lucide:play" size="16" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      :class="{ 'text-primary': selectedSong.songId === songInfo.id }"
                      :disabled="submitDisabled"
                      @click.prevent="handleSelectSong(songInfo)"
                    >
                      <Icon :name="selectedSong.songId === songInfo.id ? 'lucide:check-circle' : 'lucide:check'" size="16" />
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div v-else-if="!songFetching" class="flex h-[200px] flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              <Icon name="lucide:music-off" class="mb-2" size="32" />
              无搜索结果
            </div>

            <div v-else class="flex h-[200px] flex-col items-center justify-center rounded-md border text-sm text-muted-foreground">
              <Icon name="lucide:loader-circle" class="mb-2 animate-spin" size="32" />
              正在搜索中...
            </div>
          </template>

          <div v-else class="flex h-[200px] flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            <Icon name="lucide:search" class="mb-2" size="32" />
            输入关键词开始搜索
          </div>

          <!-- Player -->
          <SongPlayer
            v-if="songPlayingConfig.id.length > 0"
            :id="songPlayingConfig.id"
            :name="songPlayingConfig.name"
            :artists="songPlayingConfig.artists"
            :album="songPlayingConfig.album"
            :source="songPlayingConfig.source"
            :img-id="songPlayingConfig.imgId"
          />
        </CardContent>
      </Card>

      <!-- Submission Form -->
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Icon name="lucide:send" class="text-primary" size="20" />
            <CardTitle>确认投稿</CardTitle>
          </div>
          <CardDescription>核对歌曲信息并完善投稿内容</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-5" @submit="onSubmit">
            <!-- Selected Song Summary -->
            <div
              v-if="selectedSong.songId"
              class="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
            >
              <Avatar class="size-14 rounded">
                <NuxtImg
                  :src="getImgUrl(selectedSong.imgId, selectedSong.source as TMediaSource)"
                  class="object-cover"
                  :alt="selectedSong.name"
                  loading="lazy"
                />
                <AvatarFallback>
                  <Icon name="lucide:music" size="24" />
                </AvatarFallback>
              </Avatar>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  {{ selectedSong.name }}
                </p>
                <p class="truncate text-sm text-muted-foreground">
                  {{ selectedSong.creator }}
                </p>
                <div class="mt-1 flex items-center gap-2">
                  <Badge variant="outline" class="text-xs">
                    {{ getMusicSourceName(selectedSong.source as TMediaSource) }}
                  </Badge>
                  <span class="text-xs text-muted-foreground">
                    {{ formatDuration(selectedSong.duration) }}
                  </span>
                </div>
              </div>
            </div>

            <div
              v-else
              class="flex h-[88px] flex-col items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
            >
              <Icon name="lucide:mouse-pointer-click" class="mb-1" size="20" />
              从左侧或上侧选择一首歌曲
            </div>

            <div
              v-if="selectedSong.songId && (form.errors.value.songId || form.errors.value.duration)"
              class="space-y-1 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p v-if="form.errors.value.songId" class="flex items-center gap-1.5">
                <Icon name="lucide:circle-alert" size="14" />
                <span>歌曲ID：{{ form.errors.value.songId }}</span>
              </p>
              <p v-if="form.errors.value.duration" class="flex items-center gap-1.5">
                <Icon name="lucide:circle-alert" size="14" />
                <span>时长：{{ form.errors.value.duration }}</span>
              </p>
            </div>

            <FormField v-slot="{ componentField }" type="radio" name="submitType">
              <FormItem v-auto-animate class="space-y-3">
                <FormLabel>投稿时名称</FormLabel>
                <FormControl>
                  <RadioGroup class="flex flex-col space-y-1" v-bind="componentField">
                    <FormItem class="flex items-center space-y-0 gap-x-3">
                      <FormControl>
                        <RadioGroupItem value="realName" />
                      </FormControl>
                      <FormLabel class="font-normal">
                        实名
                      </FormLabel>
                    </FormItem>
                    <FormItem class="flex items-center space-y-0 gap-x-3">
                      <FormControl>
                        <RadioGroupItem value="anonymous" />
                      </FormControl>
                      <FormLabel class="font-normal">
                        匿名
                      </FormLabel>
                    </FormItem>
                    <FormItem class="flex items-center space-y-0 gap-x-3">
                      <FormControl>
                        <RadioGroupItem value="alias" :disabled="!userStore.displayName" />
                      </FormControl>
                      <FormLabel class="font-normal">
                        昵称
                        <span v-if="userStore.displayName">({{ userStore.displayName }})</span>
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField name="expectedPlayDate">
              <FormItem v-auto-animate>
                <FormLabel>期望播放日期（可选）</FormLabel>
                <FormControl>
                  <Popover>
                    <PopoverTrigger as-child>
                      <Button
                        variant="outline"
                        class="w-full justify-start text-left font-normal"
                        :class="{ 'text-muted-foreground': !form.values.expectedPlayDate }"
                      >
                        <Icon name="lucide:calendar" class="mr-2 h-4 w-4" />
                        {{ form.values.expectedPlayDate || "选择期望播放日期" }}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-auto p-0">
                      <Calendar
                        :model-value="expectedDateValue"
                        initial-focus
                        @update:model-value="handleExpectedDateChange"
                      />
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormDescription>
                  选择后歌曲将优先安排在该日期播放；不选择则由系统自由分配。
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="message">
              <FormItem v-auto-animate>
                <FormLabel>私密留言（可选）</FormLabel>
                <FormControl>
                  <Textarea v-bind="componentField" placeholder="写下你想对管理员说的话..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="msgPublic">
              <FormItem v-auto-animate>
                <FormLabel>公开留言（可选）</FormLabel>
                <FormControl>
                  <Textarea v-bind="componentField" placeholder="写下你想对大家说的话..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <div v-if="form.values.expectedPlayDate" class="space-y-3">
              <Button
                v-if="canValidate"
                type="button"
                variant="secondary"
                class="w-full"
                :disabled="previewPending"
                @click.prevent="onValidate"
              >
                <Icon v-if="previewPending" name="lucide:loader-circle" class="mr-2 animate-spin" />
                <Icon v-else name="lucide:clipboard-check" class="mr-2" />
                校验
              </Button>

              <Alert v-if="previewResult" :variant="previewResult.canSchedule ? 'default' : 'destructive'">
                <AlertTitle class="flex items-center gap-2">
                  <Icon :name="previewResult.canSchedule ? 'lucide:circle-check' : 'lucide:circle-alert'" class="size-4" />
                  {{ previewResult.canSchedule ? "可安排在期望日期当天" : "可能无法安排在期望日期当天" }}
                </AlertTitle>
                <AlertDescription>
                  <template v-if="previewResult.canSchedule">
                    预计播放日期：{{ previewResult.scheduledDate }}，预计当天位置：第 {{ previewResult.position }} 位，预计播放时间：约 {{ previewResult.playTime }}（当天共 {{ previewResult.daySongCount }} 首）。
                  </template>
                  <!-- 项目未配置不可用日期，暂不需要该分支
                  <template v-else-if="previewResult.reason === 'unavailable'">
                    期望日期当天不可用，提交后可能无法安排在当天。
                  </template>
                  -->
                  <template v-else>
                    期望日期当天容量已满，提交后可能无法安排在当天。
                  </template>
                </AlertDescription>
              </Alert>

              <div class="flex items-start gap-x-3 rounded-md border p-3">
                <Checkbox
                  id="schedule-validated"
                  :model-value="scheduleValidated"
                  @update:model-value="handleValidatedChange"
                />
                <label for="schedule-validated" class="text-sm leading-none">
                  我已校验歌曲是否能在期望日期播放
                </label>
              </div>
            </div>

            <Button
              type="submit"
              class="w-full"
              :disabled="isPending || submitDisabled || !selectedSong.songId || (!!form.values.expectedPlayDate && !scheduleValidated)"
            >
              <Icon v-if="isPending" name="lucide:loader-circle" class="mr-2 animate-spin" />
              提交投稿
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { DateValue } from "@internationalized/date";
import type { RouterOutput, TMediaSource, TSubmitType } from "~~/types";
import { vAutoAnimate } from "@formkit/auto-animate/vue";
import { parseDate } from "@internationalized/date";
import * as z from "zod";
import { getImgUrl, getMusicSourceName, musicSources } from "~~/constants";
import SongPlayer from "~/components/song/SongPlayer.vue";

const { $trpc } = useNuxtApp();
const userStore = useUserStore();

definePageMeta({
  title: "歌曲投稿",
});

useHead({
  title: "歌曲投稿",
  meta: [
    {
      name: "referrer",
      content: "no-referrer",
    },
  ],
});

const submitDisabled = ref(true);

if (!userStore.loggedIn) {
  navigateTo("/auth/login");
}
try {
  await $trpc.user.tokenValidity.query();
} catch {
  navigateTo("/auth/login");
}
try {
  const canSubmit = await $trpc.song.canSubmit.query();
  if (!canSubmit) {
    toast.error("您没有可投稿歌曲次数了");
    navigateTo("/");
  }
  submitDisabled.value = false;
} catch {
  navigateTo("/");
}

const formSchema = toTypedSchema(
  z.object({
    name: z
      .string({ required_error: "请输入歌名" })
      .trim()
      .min(1, "请输入歌名")
      .max(128, "歌名长度最大为128"),
    creator: z
      .string({ required_error: "请输入歌手名" })
      .trim()
      .min(1, "请输入歌手名")
      .max(128, "歌手长度最大为128"),
    songId: z.string({ required_error: "请输入歌曲ID" }).trim().min(1, "请输入歌曲ID"),
    imgId: z.string().trim(),
    source: z.custom<TMediaSource>(val => musicSources.some(source => source.value === val), {
      message: "请选择歌曲来源",
    }),
    duration: z.number().positive().min(30, "歌曲长度最小为30秒").max(60 * 10, "歌曲长度最大为10分钟"),
    submitType: z.custom<TSubmitType>(val => ["realName", "anonymous", "alias"].includes(val as string), {
      message: "请选择投稿时名称",
    }),
    expectedPlayDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD")
      .optional(),
    message: z.string().trim().optional(),
    msgPublic: z.string().trim().optional(),
    customUrl: z.string().trim().url().optional(),
  }),
);

const form = useForm({
  validationSchema: formSchema,
});

const expectedDateValue = computed<DateValue | undefined>(() => {
  const value = form.values.expectedPlayDate;
  if (!value)
    return undefined;
  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
});

function handleExpectedDateChange(date: DateValue | undefined) {
  if (!date) {
    form.setFieldValue("expectedPlayDate", undefined);
    return;
  }
  form.setFieldValue("expectedPlayDate", date.toString());
}

const { mutate, isPending } = useMutation({
  mutationFn: $trpc.song.create.mutate,
  onSuccess: () => {
    toast.success("提交成功！");
    submitDisabled.value = true;
    navigateTo("/");
  },
  onError: err => useErrorHandler(err),
});

const songPlayingConfig = ref<RouterOutput["search"]["mixSearch"][0]>({
  id: "",
  name: "",
  album: "",
  source: "" as TMediaSource,
  artists: "",
  imgId: "",
  duration: 0,
});
const SearchKey = ref("");
const SearchInput = ref("");
const selectedSong = ref({
  songId: "",
  name: "",
  creator: "",
  source: "",
  imgId: "",
  duration: 0,
});

function handleSelectSong(songInfo: RouterOutput["search"]["mixSearch"][0]) {
  form.setFieldValue("name", songInfo.name);
  form.setFieldValue("creator", songInfo.artists);
  form.setFieldValue("songId", songInfo.id);
  form.setFieldValue("imgId", songInfo.imgId);
  form.setFieldValue("source", songInfo.source);
  form.setFieldValue("duration", songInfo.duration);
  selectedSong.value = {
    songId: songInfo.id,
    name: songInfo.name,
    creator: songInfo.artists,
    source: songInfo.source,
    imgId: songInfo.imgId,
    duration: songInfo.duration,
  };
}

function handlePlaySong(songInfo: RouterOutput["search"]["mixSearch"][0]) {
  songPlayingConfig.value = songInfo;
}

const onSubmit = form.handleSubmit((values) => {
  const finalValues = {
    ...values,
    name: selectedSong.value.name || values.name,
    creator: selectedSong.value.creator || values.creator,
    songId: selectedSong.value.songId || values.songId,
    source: (selectedSong.value.source as TMediaSource) || values.source,
    imgId: selectedSong.value.imgId || values.imgId,
    duration: selectedSong.value.duration || values.duration,
  };
  mutate(finalValues);
});

function onSearch() {
  if (SearchInput.value.trim().length < 1) {
    toast.error("请输入歌曲名或歌手名！");
  } else if (!form.values.source) {
    toast.error("请选择歌曲来源！");
  } else {
    SearchKey.value = SearchInput.value.trim();
  }
}

const previewResult = ref<RouterOutput["song"]["previewSchedule"] | null>(null);
const previewPending = ref(false);
// 选择期望日期后需勾选确认，才允许提交
const scheduleValidated = ref(false);

const canValidate = computed(() => !!selectedSong.value.songId && !!form.values.expectedPlayDate);

function handleValidatedChange(value: boolean | "indeterminate") {
  scheduleValidated.value = value === true;
}

async function onValidate() {
  if (!canValidate.value || previewPending.value)
    return;
  previewPending.value = true;
  try {
    previewResult.value = await $trpc.song.previewSchedule.query({
      expectedPlayDate: form.values.expectedPlayDate!,
      duration: selectedSong.value.duration,
    });
  } catch (err) {
    previewResult.value = null;
    useErrorHandler(err);
  } finally {
    previewPending.value = false;
  }
}

// 选择歌曲或期望日期变化后，上次的校验结果与确认勾选失效
watch(
  () => [selectedSong.value.songId, selectedSong.value.duration, form.values.expectedPlayDate],
  () => {
    previewResult.value = null;
    scheduleValidated.value = false;
  },
);

// const searchExport = ref({
//   songs: [] as RouterOutput['search']['mixSearch'],
//   isFetching: false,
// })

// const songsList = ref<RouterOutput['search']['mixSearch']>([]);
const { isFetching: songFetching, data: songsList } = useQuery({
  queryFn: () =>
    $trpc.search.mixSearch.query({
      key: SearchKey.value,
      source: form.values.source!,
    }),
  queryKey: computed(() => ["search.mixSearch", form.values.source, SearchKey.value]),
  refetchOnWindowFocus: false,
  enabled: computed(() => SearchKey.value.trim().length > 0),
});
// const { isFetching: songFetching, data: songsList } = useQuery({
//   queryFn: () => searchSongs(SearchKey.value, form.values.source!),
//   queryKey: ["mixSearch"],
//   refetchOnWindowFocus: false,
//   enabled: computed(() => SearchKey.value.trim().length > 0),
// });

watch(
  () => form.values.source,
  () => {
    form.resetForm({
      values: {
        name: "",
        creator: "",
        songId: "",
        source: form.values.source,
        imgId: "",
        duration: 0,
        expectedPlayDate: undefined,
      },
    });
    SearchKey.value = "";
    selectedSong.value = {
      songId: "",
      name: "",
      creator: "",
      source: "",
      imgId: "",
      duration: 0,
    };
    songPlayingConfig.value = {
      id: "",
      name: "",
      album: "",
      source: "" as TMediaSource,
      artists: "",
      imgId: "",
      duration: 0,
    };
  },
);

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0)
    return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${pad(minutes)}:${pad(remainingSeconds)}`;
}
</script>
