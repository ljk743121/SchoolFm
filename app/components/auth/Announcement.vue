<template>
  <ClientOnly>
    <Alert v-if="announcement" class="overflow-hidden">
      <AlertTitle class="flex items-center gap-2">
        <Icon name="lucide:megaphone" size="16" />
        <span>{{ formatDate(announcement.createdAt) }}</span>
      </AlertTitle>
      <AlertDescription>
        <div
          class="prose prose-sm max-w-none prose-pre:bg-zinc-300 prose-pre:text-gray-800"
          v-html="$mdRenderer.render(announcement.markdown || '')"
        />
      </AlertDescription>
    </Alert>
  </ClientOnly>
</template>

<script setup lang="ts">
const { $trpc, $mdRenderer } = useNuxtApp();

function formatDate(date: Date) {
  return new Date(date).toLocaleString("zh-CN");
}

const { data: announcement } = useQuery({
  queryFn: () => $trpc.announcement.latestPublic.query(),
  queryKey: ["announcement.latestPublic"],
  enabled: import.meta.client,
  refetchOnWindowFocus: false,
});
</script>
