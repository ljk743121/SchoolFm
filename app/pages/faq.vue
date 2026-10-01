<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="mb-8 text-center text-3xl font-bold">
      常见问题 FAQ
    </h1>

    <section v-for="group in faqGroups" :key="group.category" class="mx-auto mb-8 w-full max-w-3xl">
      <h2 class="mb-3 text-lg font-semibold">
        {{ group.label }}
      </h2>

      <Accordion
        type="single"
        collapsible
        :model-value="openItem"
        @update:model-value="handleOpenChange"
      >
        <div v-for="faq in group.items" :id="faq.id" :key="faq.id" class="scroll-mt-24">
          <AccordionItem :value="faq.id">
            <AccordionTrigger>
              <span v-html="faq.question" />
            </AccordionTrigger>
            <AccordionContent>
              <div
                class="faq-answer leading-relaxed text-muted-foreground"
                v-html="$mdRenderer.render(faq.answer)"
              />
            </AccordionContent>
          </AccordionItem>
        </div>
      </Accordion>
    </section>

    <div class="mt-8 text-center">
      <Button as-child>
        <NuxtLink to="/">
          返回首页
        </NuxtLink>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { faqGroups, faqItems } from "~~/constants/faq";

definePageMeta({
  title: "常见问题",
  description: "常见问题解答",
});

useHead({
  title: "常见问题",
});

const route = useRoute();
const router = useRouter();

// 当前展开的条目，与地址栏 #锚点 双向同步
const openItem = ref("");

// Accordion 为 single 模式，事件值实际恒为 string
function handleOpenChange(value: string | string[] | undefined) {
  const id = (value as string) ?? "";
  openItem.value = id;
  // 展开/收起时同步锚点，便于分享链接；用 replace 避免每次点击都产生历史记录
  // 需显式带上 path 与 query：vue-router 对只含 hash 的部分位置会丢掉 query
  router.replace({ path: route.path, query: route.query, hash: id ? `#${id}` : "" });
}

function openFromHash() {
  if (!import.meta.client)
    return;
  const id = decodeURIComponent(route.hash.slice(1));
  if (!id || !faqItems.some(item => item.id === id))
    return;
  // 点击后的 hash 同步已经展开过该条目，无需再滚动
  if (openItem.value === id)
    return;
  openItem.value = id;
  nextTick(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

onMounted(openFromHash);
watch(() => route.hash, openFromHash);
</script>

<style scoped>
/* 项目未安装 @tailwindcss/typography，Markdown 输出需自行补齐基础排版 */
.faq-answer :deep(p) {
  margin-bottom: 0.5rem;
}

.faq-answer :deep(p:last-child) {
  margin-bottom: 0;
}

.faq-answer :deep(ul) {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.5rem 0;
  padding-left: 1.25rem;
  list-style: disc;
}

.faq-answer :deep(li) {
  line-height: 1.6;
}

.faq-answer :deep(strong) {
  font-weight: 600;
}

.faq-answer :deep(a) {
  color: var(--color-blue-600);
}

.faq-answer :deep(a:hover) {
  text-decoration: underline;
}
</style>
