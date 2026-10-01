<template>
  <main
    class="container mx-auto flex min-h-dvh max-w-screen-xl flex-col gap-4 p-5 pb-32 md:grid md:h-screen md:grid-cols-2 md:grid-rows-[1fr_auto] md:gap-8 md:p-10 md:overflow-hidden"
  >
    <section class="flex shrink-0 flex-col gap-2 overflow-x-hidden md:h-full md:gap-3 md:overflow-y-auto">
      <LogosCombined class="mx-auto h-40 w-auto object-contain md:h-35" />

      <div class="grid grid-cols-2 gap-3">
        <div class="grid grid-rows-2 gap-3">
          <Button class="block h-full items-center gap-2" variant="outline">
            <div class="text-xs">
              歌曲
            </div>
            <div class="text-xl font-bold md:text-2xl">
              {{ userStore.loggedIn ? songList?.length || songGuestList?.length || 0 : "?" }}
            </div>
          </Button>
          <LazyTimeAvailabilityDialog>
            <TimeAvailability is-card />
          </LazyTimeAvailabilityDialog>
        </div>
        <Button
          class="size-full text-lg font-bold md:text-xl"
          :disabled="!canSubmit"
          variant="secondary"
          @click.prevent="navigateTo('/submit')"
        >
          <div class="flex flex-col items-center">
            <span>
              <Icon name="lucide:music-4" class="mr-2 size-5 md:size-6" />
              投稿
            </span>
            <span v-if="userStore.loggedIn" class="text-sm font-normal">(剩余次数:{{ remainSubmitSongs?.valueOf() || 0 }})</span>
            <span v-else class="text-sm font-normal">登录以点歌</span>
          </div>
        </Button>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <HomeRule>
          <Button variant="outline" class="w-full">
            <Icon name="lucide:circle-help" class="mr-1" size="16" />
            <span> 规则介绍 </span>
          </Button>
        </HomeRule>

        <Button
          variant="outline"
          class="w-full"
          :disabled="!userStore.loggedIn"
          @click.prevent="navigateTo('/stats')"
        >
          <Icon name="lucide:chart-column" class="mr-1" size="16" />
          数据统计
        </Button>

        <HomeAboutUs>
          <Button variant="outline" class="w-full">
            <Icon name="lucide:info" class="mr-1" size="16" />
            关于我们
          </Button>
        </HomeAboutUs>
      </div>

      <div class="mt-2 flex items-center gap-4 md:mt-4">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button v-if="userStore.loggedIn" variant="ghost" class="min-w-max">
              <Avatar>
                <AvatarFallback>
                  {{ userStore.name.slice(0, 1) }}
                </AvatarFallback>
              </Avatar>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">{{ userStore.name }}</span>
                <span v-if="userStore.displayName" class="truncate text-xs">{{
                  userStore.displayName
                }}</span>
                <span class="truncate text-xs">{{ userStore.id }}</span>
              </div>
              <Icon name="lucide:chevrons-up-down" class="ml-auto size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            class="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side="bottom"
            :side-offset="4"
          >
            <DropdownMenuLabel class="p-0 font-normal">
              <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar>
                  <AvatarFallback>
                    {{ userStore.name.slice(0, 1) }}
                  </AvatarFallback>
                </Avatar>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-semibold">{{ userStore.name }}</span>
                  <span v-if="userStore.displayName" class="truncate text-xs">{{
                    userStore.displayName
                  }}</span>
                  <span class="truncate text-xs">{{ userStore.id }}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="navigateTo('/profile')">
              <Icon name="lucide:user-check" />
              个人资料
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="userStore.permissions.includes('admin')"
              @click="navigateTo('/admin')"
            >
              <Icon name="lucide:gauge" />
              管理
            </DropdownMenuItem>
            <DropdownMenuItem @click="logout">
              <Icon name="lucide:log-out" />
              登出
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          v-if="!userStore.loggedIn"
          variant="outline"
          class="w-max"
          @click.prevent="navigateTo('/auth/login')"
        >
          <Icon name="lucide:circle-user" class="size-5" />
          登录/注册 <span class="text-muted-foreground">以使用完整功能</span>
        </Button>
        <div class="ml-auto flex gap-2" />
        <DarkModeToggle />
      </div>
    </section>

    <section class="flex flex-1 flex-col md:h-full md:overflow-y-auto md:px-4 md:min-h-0">
      <!-- 添加滚动通知条 -->
      <LazyAlert v-if="announcementList && announcementList.length > 0" class="overflow-hidden py-0">
        <AlertDescription class="overflow-hidden h-12 my-auto flex items-center justify-center">
          <div class="whitespace-nowrap animate-marquee">
            <span class="mr-8 font-bold text-foreground">
              {{ (announcementList?.[0]?.createdAt?.toLocaleString() ?? '') }}:
            </span>
            {{ (announcementList?.[0]?.markdown ?? '') }}
            <span class="mr-8" />
            <span class="mr-8 font-bold text-foreground">
              {{ (announcementList?.[0]?.createdAt?.toLocaleString() ?? '') }}:
            </span>
            {{ (announcementList?.[0]?.markdown ?? '') }}
          </div>
        </AlertDescription>
      </LazyAlert>
      <Tabs v-model="selectedTab" default-value="arrangement" class="flex flex-1 flex-col">
        <div class="-mx-5 shrink-0 bg-background px-5 pt-4 md:mx-0 md:px-0">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="arrangement">
              排歌歌单
            </TabsTrigger>
            <TabsTrigger value="list">
              歌曲列表
            </TabsTrigger>
            <TabsTrigger
              value="notification"
              :class="{ 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200': hasNewAnnouncement }"
              @click="handleNotificationTab"
            >
              通知
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="list" class="flex flex-col flex-1 space-y-3">
          <Tabs v-model="listMode" default-value="songList" class="flex flex-1 flex-col">
            <div class="shrink-0">
              <TabsList class="grid w-full grid-cols-2">
                <TabsTrigger value="songList">
                  全部歌曲
                </TabsTrigger>
                <TabsTrigger value="myList" :disabled="!userStore.loggedIn">
                  我的歌曲
                </TabsTrigger>
              </TabsList>

              <div v-if="userStore.loggedIn" class="text-sm text-center bg-blue-50 text-blue-800 align-middle mx-auto flex rounded-xl border border-blue-200 shadow-sm p-3 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700">
                <Icon name="lucide:info" class="mr-2 self-start flex-shrink-0 mt-0.5" />
                <span class="flex-grow">如果无法播放请使用歌曲卡片上的刷新按钮</span>
              </div>
              <div
                v-if="selectedTab === 'list'"
                class="relative mt-1 w-full items-center bg-background"
              >
                <Input
                  id="search"
                  v-model="searchPrompt"
                  type="text"
                  placeholder="搜索歌曲"
                  class="pl-8"
                />
                <span class="absolute inset-y-0 start-0 flex items-center justify-center pl-3">
                  <Icon name="lucide:search" class="text-muted-foreground" />
                </span>
              </div>
            </div>
            <TabsContent value="songList" class="flex-1">
              <LazySongCard
                v-for="song in filteredList"
                :key="song.id"
                :song
                :is-playing="isTrackPlaying(song.id)"
                @song-export="playMusic"
              />
            </TabsContent>
            <TabsContent value="myList" class="flex-1">
              <template v-if="userStore.loggedIn">
                <LazySongCard
                  v-for="song in filteredList"
                  :key="song.id"
                  :song
                  is-mine
                  :is-playing="isTrackPlaying(song.id)"
                  @song-export="playMusic"
                />
              </template>
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="arrangement" class="flex-1">
          <DatePicker
            v-model="selectedDate"
            mode="date"
            borderless
            expanded
            title-position="left"
            is-required
            :attributes="calendarAttr"
            :is-dark="isDark"
            class="mb-4 bg-background!"
          />
          <Alert v-if="arrangementUnplayedCount" class="mb-3" variant="destructive">
            <AlertTitle class="flex items-center gap-2">
              <Icon name="lucide:alert-circle" class="size-4" />
              {{ currentArrangement?.status === 'failed' ? `当天有${arrangementUnplayedCount} 首歌没有播放,将参与下一次排歌` : `当天未播放歌曲，原有${arrangementUnplayedCount}首歌` }}
            </AlertTitle>
          </Alert>
          <Alert v-if="currentArrangement?.status === 'success'">
            <AlertTitle class="flex items-center gap-2">
              <Icon name="lucide:check-circle-2" class="size-4" />
              当天歌曲已全部成功播放
            </AlertTitle>
          </Alert>
          <ul class="flex flex-col gap-3">
            <li v-for="song in arrangementListSongs" :key="song.id">
              <SongCard
                :song
                is-arrangement
                :is-playing="isTrackPlaying(song.id)"
                @song-export="playMusic"
              />
            </li>
          </ul>
        </TabsContent>
        <TabsContent value="notification" class="flex-1">
          <div v-if="isNotificationPending">
            <Icon name="lucide:loader-2" size="20" class="animate-spin" />
          </div>
          <LazyHomeAnnouncement v-else :announcement-list="notificationList" />
        </TabsContent>
      </Tabs>
    </section>
    <div class="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 md:static md:z-auto md:col-span-2 md:px-0 md:pb-0">
      <ClientOnly>
        <MusicPlayer v-if="userStore.loggedIn" :fetch-url="fetchUrl" />
      </ClientOnly>
    </div>
  </main>
  <footer class="mt-auto border-t pt-3 text-xs leading-relaxed text-muted-foreground text-center w-full">
    <p class="mb-2">
      {{ SCHOOL_NAME }}是<b>深圳实验学校</b>的校园广播站，提供<b>歌曲投稿</b>、<b>在线试听</b>、<b>智能排歌</b>与<b>自动化流程</b>服务，支持广播站放歌流程的自动化运行。
    </p>
    <p class="mb-2">
      Powered by <a href="https://github.com/ljk743121/SchoolFm" target="_blank" rel="noopener noreferrer hover:text-foreground hover:underline">
        SchoolFm
      </a>
    </p>
  </footer>
</template>

<script setup lang="ts">
import type { RouterOutput } from "~~/types";
import type { TPlayerTrack } from "~/composables/useMusicPlayer";
import { useFuse, type UseFuseOptions } from "@vueuse/integrations/useFuse";
import { DatePicker } from "@ztl-uwu/v-calendar";
import { getImgUrl, SCHOOL_NAME } from "~~/constants";
// import { fetchMusicUrl } from "~~/deprecate/shared/plugin";

useSeoMeta({
  title: `首页`,
  description: `${SCHOOL_NAME} 点歌系统首页 - 浏览排歌歌单、查看歌曲、投稿歌曲。开源校园广播站管理系统，支持在线试听、投稿、智能排歌、歌单管理、自动化流程。`,
  keywords: "深圳实验,校园点歌系统,广播站,排歌歌单,歌曲列表,歌曲投稿,智能排歌,自动化,SchoolFm,nuxt",
  ogTitle: `首页`,
  ogDescription: `${SCHOOL_NAME} 点歌系统首页 - 浏览排歌歌单、查看歌曲、投稿歌曲。开源校园广播站管理系统。`,
  ogUrl: "https://voszsy.penacony.cn",
  twitterCard: "summary_large_image",
  twitterTitle: `首页`,
  twitterDescription: `${SCHOOL_NAME} 点歌系统首页 - 浏览排歌歌单、查看歌曲、投稿歌曲。开源校园广播站管理系统。`,
});

useHead({
  link: [
    {
      rel: "canonical",
      href: "https://voszsy.penacony.cn",
    },
  ],
  meta: [
    {
      name: "referrer",
      content: "no-referrer",
    },
  ],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": `${SCHOOL_NAME} 点歌系统 | SchoolFm`,
        "description": `${SCHOOL_NAME} 点歌系统首页 - 浏览排歌歌单、查看歌曲、投稿歌曲。开源校园广播站管理系统。`,
        "url": "https://voszsy.penacony.cn",
        "mainEntity": {
          "@type": "WebApplication",
          "name": `${SCHOOL_NAME} 点歌系统 | SchoolFm`,
          "applicationCategory": "EducationApplication",
          "operatingSystem": "Any",
        },
      }),
    },
  ],
});

const userStore = useUserStore();
const { $trpc } = useNuxtApp();
const queryClient = useQueryClient();

const selectedDate = ref(new Date());
const isDark = computed(() => useColorMode().preference === "dark");
const hasNewAnnouncement = ref(false);

if (userStore.loggedIn) {
  try {
    await $trpc.user.tokenValidity.query();
  } catch {
    userStore.logout();
  }
}

const { data: songList, suspense: songListSuspense } = useQuery({
  queryFn: () => $trpc.song.listSafe.query(),
  queryKey: ["song.listSafe"],
  refetchInterval: 10000,
  refetchIntervalInBackground: false,
  refetchOnMount: false,
  enabled: userStore.loggedIn,
});

const { data: songGuestList, suspense: songGuestListSuspense } = useQuery({
  queryFn: () => $trpc.song.listGuest.query(),
  queryKey: ["song.listGuest"],
  refetchInterval: 10000,
  refetchIntervalInBackground: false,
  refetchOnMount: false,
  enabled: !userStore.loggedIn,
});

const { data: mySongList, suspense: mySongListSuspense } = useQuery({
  queryFn: () => $trpc.song.listMine.query(),
  queryKey: ["song.listMine"],
  refetchIntervalInBackground: false,
  refetchOnMount: false,
  enabled: userStore.loggedIn,
});

const { data: canSubmit, suspense: canSubmitSuspense } = useQuery({
  queryFn: () => $trpc.song.canSubmit.query(),
  queryKey: ["song.canSubmit"],
  refetchInterval: 10000,
  refetchIntervalInBackground: false,
  refetchOnMount: false,
  enabled: userStore.loggedIn,
});

const { data: remainSubmitSongs, suspense: remainSubmitSongsSuspense } = useQuery({
  queryFn: () => $trpc.song.remainSubmitSongs.query(),
  queryKey: ["song.remainSubmitSongs"],
  refetchIntervalInBackground: false,
  refetchInterval: 10000,
  refetchOnMount: false,
  enabled: userStore.loggedIn,
});

const { data: arrangementList, suspense: arrangementListSuspense } = useQuery({
  queryFn: () => $trpc.arrangements.listSafe.query(),
  queryKey: ["arrangements.listSafe"],
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  enabled: userStore.loggedIn,
});

const { data: arrangementGuestList, suspense: arrangementGuestListSuspense } = useQuery({
  queryFn: () => $trpc.arrangements.listGuest.query(),
  queryKey: ["arrangements.listGuest"],
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  enabled: !userStore.loggedIn,
});

const { data: announcementList, suspense: announcementListSuspense, isPending: isAnnouncementListPending } = useQuery({
  queryFn: () => $trpc.announcement.listSafe.query(),
  queryKey: ["announcement.listSafe"],
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
  enabled: userStore.loggedIn,
});

const { data: announcementHash, suspense: announcementHashSuspense } = useQuery({
  queryFn: () => $trpc.announcement.getHash.query(),
  queryKey: ["announcement.getHash"],
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
  enabled: userStore.loggedIn,
});

const { data: publicAnnouncement, isPending: isPublicAnnouncementPending } = useQuery({
  queryFn: () => $trpc.announcement.latestPublic.query(),
  queryKey: ["announcement.latestPublic"],
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
  enabled: !userStore.loggedIn,
});

const notificationList = computed<RouterOutput["announcement"]["listSafe"]>(() => {
  if (userStore.loggedIn) {
    return userStore.announcementCache && userStore.announcementCache.length > 0
      ? userStore.announcementCache
      : announcementList.value ?? [];
  }
  return publicAnnouncement.value ? [publicAnnouncement.value] : [];
});

const isNotificationPending = computed(() =>
  userStore.loggedIn ? isAnnouncementListPending.value : isPublicAnnouncementPending.value,
);

function handleNotificationTab() {
  hasNewAnnouncement.value = false;
  if (userStore.loggedIn)
    updateLoginTime();
}

function getDateString(date: Date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

const currentArrangement = computed(() => {
  const list = userStore.loggedIn ? arrangementList.value : arrangementGuestList.value;
  return list?.find((e: { date: string }) => e.date === getDateString(selectedDate.value));
});

const arrangementListSongs = computed(() => {
  return currentArrangement.value?.songs || [];
});

const arrangementUnplayedCount = computed(() => {
  return (currentArrangement.value?.songs || []).filter(
    (s: { state?: string }) => s.state === "missed" || s.state === "failed",
  ).length;
});

const calendarAttr = computed(() => {
  const res = [];
  const list = userStore.loggedIn ? arrangementList.value : arrangementGuestList.value;
  for (const arrangement of list ?? []) {
    let dotColor: string | boolean = true;
    if (arrangement.status === "missed") {
      dotColor = "red";
    } else if (arrangement.status === "failed") {
      dotColor = "yellow";
    } else if (arrangement.status === "success") {
      dotColor = "green";
    } else if (arrangement.date < getDateString(new Date())) {
      dotColor = "gray";
    }
    res.push({
      dot: dotColor,
      dates: new Date(arrangement.date),
    });
  }

  return res;
});

if (userStore.loggedIn) {
  try {
    // 并行等待首屏数据，减少串行等待时间，加快页面首次绘制
    await Promise.all([
      songListSuspense(),
      canSubmitSuspense(),
      mySongListSuspense(),
      arrangementListSuspense(),
      remainSubmitSongsSuspense(),
    ]);
  } catch {
    navigateTo("/auth/login");
  }

  await Promise.all([announcementHashSuspense(), announcementListSuspense()]);

  if (announcementHash.value && userStore.announcementHash !== announcementHash.value.hash) {
    // 哈希值不同，说明有新通知，使用新获取的通知
    userStore.cacheAnnouncements(announcementList.value || [], announcementHash.value.hash);
    hasNewAnnouncement.value = true;
    toast.warning("有新的公告等待查看");
  } else {
    // 哈希值相同，使用缓存的通知
    if (userStore.announcementCache && userStore.announcementCache.length > 0) {
      // 如果缓存存在但当前获取的数据没有变化，则直接使用缓存
      // 实际上这里会自动使用缓存，因为我们已经设置了refetchOnWindowFocus为false
    }
  }
} else {
  await arrangementGuestListSuspense();
  await songGuestListSuspense();
}

function updateLoginTime() {
  $trpc.user.updateLoginTime.mutate();
  userStore.lastLoginAt = new Date().toISOString();
}

function logout() {
  userStore.logout();
  toast.success("登出成功");
  navigateTo("/auth/login", { replace: true });
}

type TLists = RouterOutput["song"]["listSafe"];
type TGuestLists = RouterOutput["song"]["listGuest"];
const listMode = ref<"songList" | "myList">("songList");

const fuseOptions: UseFuseOptions<TLists[0]> = {
  fuseOptions: {
    keys: ["name", "creator"],
    shouldSort: true,
  },
  matchAllWhenSearchEmpty: true,
};
const fuseGuestOptions: UseFuseOptions<TGuestLists[0]> = {
  fuseOptions: {
    keys: ["name", "creator"],
    shouldSort: true,
  },
  matchAllWhenSearchEmpty: true,
};

const searchPrompt = ref("");
const fuse = computed(() => {
  if (!userStore.loggedIn) {
    return songGuestList.value === undefined
      ? useFuse<TGuestLists[0]>(searchPrompt, [], fuseGuestOptions)
      : useFuse<TGuestLists[0]>(searchPrompt, songGuestList.value, fuseGuestOptions);
  }
  if (listMode.value === "songList") {
    return songList.value === undefined
      ? useFuse<TLists[0]>(searchPrompt, [], fuseOptions)
      : useFuse<TLists[0]>(searchPrompt, songList.value, fuseOptions);
  }
  if (listMode.value === "myList") {
    return mySongList.value === undefined
      ? useFuse<TLists[0]>(searchPrompt, [], fuseOptions)
      : useFuse<TLists[0]>(searchPrompt, mySongList.value, fuseOptions);
  }
  return useFuse<TLists[0]>(searchPrompt, [], fuseOptions);
});

const filteredList = computed(() => fuse.value.results.value.map(e => e.item));

const selectedTab = ref<"list" | "arrangement" | "notification">("arrangement");

const { playAsPlaylist, isTrackPlaying } = useMusicPlayer();

const tracks = ref<TPlayerTrack[]>([]);
const track = ref<TPlayerTrack>();
const previousList = ref<string>();
const previousDate = ref(new Date());

useQuery({
  queryFn: () => $trpc.search.mixGetUrl.query,
  queryKey: ["search.mixGetUrl"],
  refetchOnWindowFocus: false,
  refetchIntervalInBackground: false,
  enabled: !!track.value,
});

// useQuery({
//   queryFn: () => track.value?.data?.songId && track.value?.data?.source
//     ? fetchMusicUrl(track.value.data.songId as string, track.value.data.source as string)
//     : Promise.resolve({ url: "", pay: false }),
//   queryKey: ["fetchMusicUrl"],
//   refetchOnWindowFocus: false,
//   refetchIntervalInBackground: false,
//   enabled: !!track.value?.data?.songId && !!track.value?.data?.source,
// });

async function fetchUrl(data: Record<string, unknown>) {
  if (!data)
    return "";
  if (!data.songId || !data.source)
    return "";
  const id = `${data.songId as string}-${data.source as string}`;
  if (userStore.songCache[id]) {
    return userStore.songCache[id]!;
  }
  await queryClient.invalidateQueries({ queryKey: ["search.mixGetUrl"] });
  const song = await queryClient.fetchQuery({
    queryKey: ["search.mixGetUrl"],
    queryFn: () =>
      $trpc.search.mixGetUrl.query({
        id: data.songId! as string,
        source: data.source! as string,
      }),
  });
  // await queryClient.invalidateQueries({ queryKey: ["fetchMusicUrl"] });
  // const song = await queryClient.fetchQuery({
  //   queryKey: ["fetchMusicUrl"],
  //   queryFn: () => fetchMusicUrl(data.songId! as string, data.source! as string),
  // });
  if (song) {
    if (song.url) {
      userStore.cacheSong(id, song.url);
    }
    return song.url;
  }
  return "";
}

async function playMusic(song: Partial<RouterOutput["song"]["listSafe"][0]>) {
  if (song.songId === null || song.source === null) {
    toast.error("无歌曲数据");
    return;
  }
  const isOutdate
    = (selectedTab.value === "list" ? listMode.value : selectedTab.value) !== previousList.value
      || selectedDate.value !== previousDate.value;
  if (!tracks.value.length || isOutdate) {
    let TrackList: TLists | undefined;
    if (selectedTab.value === "list") {
      if (listMode.value === "songList") {
        TrackList = songList.value;
      } else if (listMode.value === "myList") {
        TrackList = mySongList.value;
      }
    } else if (selectedTab.value === "arrangement") {
      if (selectedDate.value !== previousDate.value)
        TrackList = arrangementListSongs.value as TLists;
    }
    previousList.value = selectedTab.value === "list" ? listMode.value : selectedTab.value;
    if (TrackList) {
      tracks.value = Array.from(TrackList, (e): TPlayerTrack | undefined => {
        if (!e.songId || !e.source)
          return undefined;
        return {
          id: e.id!,
          title: e.name!,
          artist: e.creator!,
          artwork: e.imgId ? getImgUrl(e.imgId, e.source!) : "",
          album: "",
          data: {
            songId: e.songId,
            source: e.source!,
          },
        };
      }).filter((e): e is TPlayerTrack => e !== undefined);
    }
  }
  track.value = {
    id: song.id!,
    title: song.name!,
    artist: song.creator!,
    artwork: song.imgId ? getImgUrl(song.imgId, song.source!) : "",
    album: "",
    data: {
      songId: song.songId,
      source: song.source!,
    },
  };
  playAsPlaylist(tracks.value, track.value);
}
</script>

<style>
/* 页面级别平滑滚动 */
html {
  scroll-behavior: smooth;
}

/* 页面级别自定义滚动条 - Webkit */
::-webkit-scrollbar {
  width: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: 9999px;
  transition: background-color 0.2s;
}
::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}

/* 页面级别自定义滚动条 - Firefox */
html {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
}
</style>

<style scoped>
.animate-marquee {
  animation: marquee 30s linear infinite;
}
@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
