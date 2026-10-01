<template>
  <div class="grid gap-4">
    <div>
      <div class="justify-center text-center text-sm text-muted-foreground">
        排歌选取
      </div>
      <RangeCalendar
        :model-value="calendarValue"
        locale="zh"
        class="p-0"
        @update:model-value="$emit('update:calendarValue', $event)"
      />
      <div
        v-if="calendarValue.start && calendarValue.end"
        class="mt-3 flex items-center justify-between"
      >
        <Badge variant="outline">
          {{ calendarValue.start }}
        </Badge>
        <Icon name="lucide:arrow-right" size="14" />
        <Badge variant="outline">
          {{ calendarValue.end }}
        </Badge>
      </div>
    </div>

    <div class="grid gap-1">
      <div
        v-for="requirement in requirementList"
        :key="requirement.label"
        class="flex items-center gap-2"
      >
        <Icon v-if="requirement.value" name="lucide:check" class="text-green-500" />
        <Icon v-else name="lucide:x" class="text-red-500" />
        <span class="text-sm font-medium">
          {{ requirement.label }}
        </span>
      </div>
    </div>

    <NumberField
      id="songCount"
      :model-value="songCount"
      :default-value="0"
      :min="0"
      @update:model-value="$emit('update:songCount', $event ?? 0)"
    >
      <Label for="songCount" class="text-xs font-medium">每日歌曲数目：</Label>
      <NumberFieldContent class="bg-background">
        <NumberFieldDecrement />
        <NumberFieldInput />
        <NumberFieldIncrement />
      </NumberFieldContent>
    </NumberField>

    <Button
      :disabled="!canArrange || isPending"
      class="transition-all"
      @click="$emit('arrange')"
    >
      <Icon v-if="isPending" name="lucide:loader-circle" class="mr-2 animate-spin" />
      <Icon name="lucide:play" class="mr-2" />
      {{ songCount ? "手动排歌" : "自动排歌" }}
    </Button>

    <Alert
      v-if="arrangeResult && (arrangeResult.conflicts.length || arrangeResult.droppedCount || arrangeResult.evictedCount)"
      variant="destructive"
    >
      <AlertTitle>排歌冲突提示</AlertTitle>
      <AlertDescription>
        <ScrollArea class="h-[200px] w-full max-w-full rounded-md border px-3 py-2">
          <p class="mb-2">
            已安排 {{ arrangeResult.placedCount }} 首，舍弃 {{ arrangeResult.droppedCount }} 首，发现 {{ arrangeResult.conflicts.length }} 个期望日期冲突<template v-if="arrangeResult.evictedCount">
              ，为安排期望日/欠播歌曲回退了 {{ arrangeResult.evictedCount }} 首普通歌曲
            </template>。
          </p>
          <ul v-if="arrangeResult.conflicts.length" class="list-disc space-y-1 pl-5">
            <li v-for="conflict in arrangeResult.conflicts" :key="conflict.songId">
              歌曲 #{{ conflict.songId }} 期望日期 {{ conflict.expectedDate }} {{ conflict.reason === 'unavailable' ? '不可用' : '已满' }}
              <span v-if="conflict.suggestedDate">，已建议调整至 {{ conflict.suggestedDate }}</span>
            </li>
          </ul>
        </ScrollArea>
      </AlertDescription>
    </Alert>
  </div>
</template>

<script setup lang="ts">
import type { DateRange } from "reka-ui";
import type { RouterOutput } from "~~/types";
import { RangeCalendar } from "@/components/ui/range-calendar";

interface Requirement {
  label: string;
  value: boolean;
}

defineProps<{
  calendarValue: DateRange;
  songCount: number;
  requirementList: Requirement[];
  canArrange: boolean;
  isPending: boolean;
  arrangeResult: RouterOutput["arrangements"]["arrange"] | null;
}>();

defineEmits<{
  (e: "update:calendarValue", value: DateRange): void;
  (e: "update:songCount", value: number): void;
  (e: "arrange"): void;
}>();
</script>
