<template>
  <!-- Public song card -->
  <Card v-if="type === 'public'" class="group transition-shadow hover:shadow-md">
    <CardHeader class="pb-0">
      <div class="flex gap-3 md:gap-4">
        <!-- Cover -->
        <Avatar class="relative shrink-0 size-12 overflow-hidden rounded-md md:size-14 lg:size-16">
          <NuxtImg
            v-if="imgUrl"
            :src="imgUrl"
            :alt="song.name"
            class="h-full w-full object-cover"
            loading="lazy"
          />
          <Icon v-else name="lucide:music" size="20" class="m-auto" />
        </Avatar>

        <!-- Info -->
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <CardTitle class="line-clamp-1 text-base md:text-lg">
                {{ song.name }}
              </CardTitle>
              <CardDescription class="mt-0.5 line-clamp-1 text-xs md:text-sm">
                歌手：{{ song.creator }}
              </CardDescription>
            </div>
            <span v-if="timeAgo" class="shrink-0 text-xs text-muted-foreground">
              {{ timeAgo }}
            </span>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" class="text-xs">
              {{ sourceName }}
            </Badge>
            <Badge variant="secondary" class="text-xs">
              {{ realNameLabel }}
            </Badge>
            <Badge v-if="playTime" variant="outline" class="text-xs">
              <Icon name="lucide:clock" class="mr-1 size-3" />
              预计 {{ playTime }} 播放
            </Badge>
            <Badge
              v-if="isMine && song.arrangementDate && song.arrangementDate !== song.expectedPlayDate"
              variant="secondary"
              class="text-xs"
            >
              <Icon name="lucide:calendar" class="mr-1 size-3" />
              {{ song.arrangementDate }}
            </Badge>
            <Badge
              v-else-if="isMine && song.arrangementDate && song.arrangementDate === song.expectedPlayDate"
              variant="secondary"
              class="text-xs"
            >
              <Icon name="lucide:check" class="mr-1 size-3" />
              期望日期：{{ song.expectedPlayDate }}
            </Badge>
            <span
              v-if="song.ownerDisplayName"
              class="max-w-[120px] truncate text-xs text-muted-foreground md:max-w-[180px] lg:max-w-[240px]"
            >
              提交者：{{ song.ownerDisplayName }}
            </span>
          </div>

          <SongState v-if="!(isArrangement && song.state === 'used')" :song class="mt-2" />

          <p
            v-if="song.msgPublic"
            class="mt-2 line-clamp-2 text-xs text-muted-foreground"
          >
            留言：{{ song.msgPublic }}
          </p>
        </div>
      </div>
    </CardHeader>

    <CardContent class="flex flex-wrap items-center gap-2 pt-0">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="outline"
              size="icon"
              :disabled="!canPlay"
              :aria-label="isPlaying ? '暂停' : '播放'"
              @click.stop="handleAvatarClick"
            >
              <Icon :name="isPlaying ? 'lucide:pause' : 'lucide:play'" class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ isPlaying ? '暂停' : '播放' }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              v-if="canPlay"
              variant="outline"
              size="icon"
              aria-label="重置缓存"
              @click.stop="resetSongCache(song.songId!, song.source!, `${song.name} - ${song.creator}`)"
            >
              <Icon name="lucide:refresh-cw" class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>重置缓存</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button
        v-if="song.likes"
        variant="outline"
        class="h-9 gap-1 px-2"
        :disabled="isVoting || isDisVoting || !userStore.loggedIn"
        @click.prevent="toggleVote"
      >
        <Icon
          name="lucide:heart"
          class="size-4 transition-colors"
          :class="isLiked ? 'fill-red-500 text-red-500' : ''"
        />
        <span class="min-w-[1ch] text-sm">{{ song.likeCount ?? 0 }}</span>
      </Button>

      <SongDeleteMySong
        v-if="isMine && song.state && song.state !== 'used'"
        :song="song"
      />

      <Button
        variant="outline"
        class="ml-auto h-9"
        @click.stop="isOpen = true"
      >
        <Icon name="lucide:info" class="mr-1 size-4" />
        详情
      </Button>

      <div v-if="likeUsersText" class="w-full pt-2 text-xs text-muted-foreground">
        <Icon name="lucide:heart" class="mr-1 inline size-3" />
        {{ likeUsersText }}
      </div>
    </CardContent>

    <ClientOnly>
      <UseTemplate>
        <ul class="grid gap-3">
          <li v-if="song.duration" class="flex justify-between gap-4">
            <span class="min-w-20 text-sm text-muted-foreground">时长</span>
            <span class="font-mono">{{ formatDuration(song.duration) }}</span>
          </li>
          <li class="flex justify-between gap-4">
            <span class="min-w-20 text-sm text-muted-foreground">审核状态</span>
            <SongState :song hide-reason />
          </li>
          <li v-if="song.rejectMessage" class="flex flex-col gap-1">
            <span class="text-sm text-muted-foreground">拒绝理由</span>
            <span class="text-sm">{{ song.rejectMessage }}</span>
          </li>
          <li v-if="song.arrangementDate" class="flex justify-between gap-4">
            <span class="min-w-20 text-sm text-muted-foreground">播放时间</span>
            <span class="font-mono">{{ song.arrangementDate }}</span>
          </li>
          <li v-if="song.expectedPlayDate" class="flex justify-between gap-4">
            <span class="min-w-20 text-sm text-muted-foreground">期望播放日期</span>
            <span class="font-mono">{{ song.expectedPlayDate }}</span>
          </li>
          <li v-else class="flex justify-between gap-4">
            <span class="min-w-20 text-sm text-muted-foreground">自由分配</span>
          </li>
          <li v-if="song.msgPublic" class="flex flex-col gap-1">
            <span class="text-sm text-muted-foreground">留言</span>
            <span class="text-sm">{{ song.msgPublic }}</span>
          </li>
          <li v-if="song.message" class="flex flex-col gap-1">
            <span class="text-sm text-muted-foreground">私密留言</span>
            <span class="text-sm">{{ song.message }}</span>
          </li>
          <li v-if="song.createdAt" class="flex justify-between gap-4">
            <span class="min-w-20 text-sm text-muted-foreground">投稿时间</span>
            <span class="font-mono">{{ song.createdAt.toLocaleString('zh-CN') }}</span>
          </li>
        </ul>
      </UseTemplate>

      <Dialog v-model:open="isOpen">
        <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              <NuxtImg
                v-if="imgUrl"
                :src="imgUrl"
                :alt="song.name"
                class="mb-3 aspect-square w-full max-h-[25vh] md:max-h-[30vh] rounded-lg object-cover"
                loading="lazy"
              />
              {{ song.name }}
            </DialogTitle>
            <DialogDescription>
              歌手：{{ song.creator }}
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">
                  {{ sourceName }}
                </Badge>
                <Badge variant="secondary">
                  {{ realNameLabel }}
                </Badge>
                <span v-if="song.ownerDisplayName" class="text-xs text-muted-foreground">
                  提交者：{{ song.ownerDisplayName }}
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>
          <SongDrawer />
        </DialogContent>
      </Dialog>
    </ClientOnly>
  </Card>

  <!-- Review card -->
  <div
    v-else-if="type === 'review'"
    class="h-auto w-full cursor-pointer rounded-lg border p-4 shadow-xs transition-colors hover:bg-muted"
    :class="{ 'bg-muted': selected }"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <CardTitle class="line-clamp-1 text-base md:text-lg">
          {{ song.name }}
        </CardTitle>
        <CardDescription class="mt-0.5 line-clamp-1 text-xs md:text-sm">
          歌手：{{ song.creator }}
        </CardDescription>
      </div>
      <span v-if="song.duration" class="shrink-0 text-xs font-mono text-muted-foreground">
        {{ formatDuration(song.duration) }}
      </span>
    </div>
    <div v-if="song.message" class="mt-2 line-clamp-2 text-xs text-muted-foreground">
      私密留言：{{ song.message }}
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" class="text-xs">
        {{ sourceName }}
      </Badge>
      <Badge v-if="song.message" variant="destructive" class="text-xs">
        有留言
      </Badge>
      <Badge v-if="song.expectedPlayDate" variant="secondary" class="text-xs">
        期望：{{ song.expectedPlayDate }}
      </Badge>
      <Badge v-else variant="secondary" class="text-xs">
        自由分配
      </Badge>
    </div>
  </div>

  <!-- Admin songs card -->
  <Card v-else-if="type === 'songs'">
    <CardHeader class="pb-0">
      <div class="min-w-0">
        <CardTitle class="line-clamp-1 text-base md:text-lg">
          {{ song.name }}
        </CardTitle>
        <CardDescription class="mt-0.5 line-clamp-1 text-xs md:text-sm">
          歌手：{{ song.creator }}
        </CardDescription>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" class="text-xs">
            {{ sourceName }}
          </Badge>
          <Badge v-if="song.duration" variant="secondary" class="text-xs">
            {{ formatDuration(song.duration) }}
          </Badge>
          <Badge v-if="song.message" variant="destructive" class="text-xs">
            有留言
          </Badge>
          <Badge v-if="song.expectedPlayDate" variant="secondary" class="text-xs">
            期望：{{ song.expectedPlayDate }}
          </Badge>
          <Badge v-else variant="secondary" class="text-xs">
            自由分配
          </Badge>
        </div>
      </div>

      <p v-if="song.message" class="mt-2 line-clamp-2 text-xs text-muted-foreground">
        私密留言：{{ song.message }}
      </p>
      <p v-if="song.msgPublic" class="mt-2 line-clamp-2 text-xs text-muted-foreground">
        公开留言：{{ song.msgPublic }}
      </p>
    </CardHeader>

    <CardContent class="flex flex-col gap-2 pt-0 sm:flex-row sm:flex-wrap sm:items-center">
      <template v-if="song.state !== 'used' && song.state !== 'played' && song.state !== 'dropped' && song.state !== 'missed' && song.state !== 'failed'">
        <Button
          v-if="song.state !== 'approved' && song.id"
          variant="outline"
          size="sm"
          class="h-9 w-full sm:w-auto"
          :disabled="approvePending"
          @click="approve({ id: song.id })"
        >
          <Icon v-if="approvePending" name="lucide:loader-circle" class="mr-2 animate-spin" />
          <Icon v-else name="lucide:check" class="mr-1" />
          通过
        </Button>

        <template v-if="song.state !== 'rejected' && song.id">
          <Button
            variant="outline"
            size="sm"
            class="h-9 w-full sm:w-auto"
            :disabled="rejectPending"
            @click="reject({ id: song.id, rejectMessage: rejectMessage.trim() })"
          >
            <Icon v-if="rejectPending" name="lucide:loader-circle" class="mr-2 animate-spin" />
            <Icon v-else name="lucide:x" class="mr-1" />
            拒绝
          </Button>
          <Input
            v-model="rejectMessage"
            placeholder="拒绝理由"
            class="h-9 flex-1 rounded-sm text-xs sm:min-w-[160px]"
          />
        </template>
      </template>

      <AdminSongDeleteSong v-if="userStore.permissions.includes('deleteSong')" :song="song" />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { RouterOutput, TMediaSource } from "~~/types";
import { getImgUrl, getMusicSourceName } from "~~/constants";

type TSongCardSong = Partial<RouterOutput["song"]["list"][0]> & {
  likeUsers?: string[];
};

const {
  song,
  type = "public",
  selected = false,
  isArrangement = false,
  isMine = false,
  isPlaying = false,
  playTime,
} = defineProps<{
  type?: "public" | "review" | "songs";
  selected?: boolean;
  song: TSongCardSong;
  isArrangement?: boolean;
  isMine?: boolean;
  isPlaying?: boolean;
  /** 预计播放时间（HH:mm），仅排歌列表传入 */
  playTime?: string;
}>();

const emit = defineEmits<{
  (e: "songExport", songInformation: TSongCardSong): void;
}>();

const isOpen = ref(false);

const [UseTemplate, SongDrawer] = createReusableTemplate();
const { $trpc } = useNuxtApp();
const userStore = useUserStore();
const queryClient = useQueryClient();

// Derived state
const imgUrl = computed(() =>
  song.imgId && song.source ? getImgUrl(song.imgId, song.source) : undefined,
);
const likeUsersText = computed(() => song.likeUsers?.join(", ") ?? "");

const sourceName = computed(() => getMusicSourceName(song.source as TMediaSource));

const realNameLabel = computed(() => (song.isRealName ? "实名" : "匿名"));

const rawTimeAgo = useTimeAgo(() => song.createdAt ?? "");
const timeAgo = computed(() => (song.createdAt ? rawTimeAgo.value : undefined));

const canPlay = computed(() => Boolean(song.songId && song.source && song.songId.length > 0));

const isLiked = computed(() => song.likes?.includes(userStore.id) ?? false);

// Review mutations
const { mutate: approve, isPending: approvePending } = useMutation({
  mutationFn: $trpc.song.review.approve.mutate,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["song.list"] });
  },
  onError: err => useErrorHandler(err),
});

const { mutate: reject, isPending: rejectPending } = useMutation({
  mutationFn: $trpc.song.review.reject.mutate,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["song.list"] });
  },
  onError: err => useErrorHandler(err),
});

const rejectMessage = ref("");

// Vote mutations
const { mutate: vote, isPending: isVoting } = useMutation({
  mutationFn: $trpc.song.vote.mutate,
  onSuccess: () => {
    toast.success("点赞成功");
    invalidateSongQueries();
  },
  onError: err => useErrorHandler(err),
});

const { mutate: disvote, isPending: isDisVoting } = useMutation({
  mutationFn: $trpc.song.disvote.mutate,
  onSuccess: () => {
    toast.success("取消点赞成功");
    invalidateSongQueries();
  },
  onError: err => useErrorHandler(err),
});

function invalidateSongQueries() {
  queryClient.invalidateQueries({ queryKey: ["song.listMine"] });
  queryClient.invalidateQueries({ queryKey: ["song.listSafe"] });
  queryClient.invalidateQueries({ queryKey: ["arrangement.listSafe"] });
}

function toggleVote() {
  if (!song.id)
    return;
  if (isLiked.value) {
    disvote(song.id);
  } else {
    vote(song.id);
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0)
    return "00:00:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
}

function handleAvatarClick(e: Event) {
  e.stopPropagation();
  if (canPlay.value) {
    emit("songExport", song);
  }
}

function resetSongCache(songId: string, source: string, name: string) {
  const cacheKey = `${songId}-${source}`;
  delete userStore.songCache[cacheKey];
  toast.success(`已重置${name}缓存`);
  queryClient.invalidateQueries({ queryKey: ["search.mixGetUrl"] });
}
</script>
