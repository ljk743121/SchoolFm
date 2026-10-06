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

    <Alert v-if="arrangeResult" variant="destructive">
      <AlertTitle>排歌结果</AlertTitle>
      <AlertDescription>
        <ScrollArea class="h-[220px] w-full max-w-full rounded-md border px-3 py-2">
          <p class="mb-2">
            已安排 {{ arrangeResult.placedCount }} 首，落选 {{ arrangeResult.droppedCount }} 首，被挤出原排期 {{ arrangeResult.evictedCount }} 首，调期 {{ arrangeResult.adjustedCount }} 首<template v-if="arrangeResult.frozenDays.length">
              ，跳过已锁定排期 {{ arrangeResult.frozenDays.length }} 天
            </template>。
          </p>
          <ul v-if="arrangeResult.conflicts.length" class="list-disc space-y-1 pl-5">
            <li v-for="conflict in arrangeResult.conflicts" :key="conflict.songId">
              歌曲 #{{ conflict.songId }}：期望 {{ conflict.expectedDate }}，实际排到 {{ conflict.actualDate }}
              <span class="opacity-70">（{{ reasonLabel(conflict.reason) }}）</span>
            </li>
          </ul>
          <p v-else class="opacity-70">
            所有歌曲均排在期望日期。
          </p>
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

type AdjustReason = RouterOutput["arrangements"]["arrange"]["conflicts"][number]["reason"];

/** 调期原因：期望日已过 → 顺延补播；期望日当天已无空间 → 期望日已排满 */
function reasonLabel(reason: AdjustReason) {
  if (reason === "past")
    return "期望日已过，顺延补播";
  if (reason === "full")
    return "期望日已排满";
  if (reason === "frozen")
    return "期望日不可排（已播放/已锁定）";
  return "期望日已被固定占用占满";
}
</script>
