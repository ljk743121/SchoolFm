<template>
  <SidebarInset>
    <Card class="mx-auto w-full">
      <CardHeader>
        <CardTitle>公告管理</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-6">
          <div v-if="!isPending">
            <div v-if="!isEditing || !isEditing.status" class="space-y-4 rounded-lg border p-4">
              <h3 class="font-semibold">
                发布公告
              </h3>
              <ClientOnly>
                <MdEditor
                  v-model="newAnnouncement"
                  language="zh-CN"
                  no-upload-img
                  :toolbars="toolbars"
                  :read-only="isPending || isPostPending"
                />
              </ClientOnly>
              <Accordion type="single" collapsible>
                <AccordionItem value="item-1">
                  <AccordionTrigger>发布时显示的名称是什么？</AccordionTrigger>
                  <AccordionContent>
                    默认显示你设置的昵称，如果没有设置则默认使用您的真名。
                    以前发布的公告的昵称不会因为昵称被修改而改变。
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <Select v-model="newAnnouncementVisibility">
                <SelectTrigger>
                  <SelectValue placeholder="选择可见性" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="admin">
                      仅管理人员可见
                    </SelectItem>
                    <SelectItem value="all">
                      所有人可见
                    </SelectItem>
                    <SelectItem value="public">
                      仅未登录用户可见
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button :disabled="isPostPending" @click="postAnnouncement">
                <Icon v-if="isPostPending" name="lucide:loader-2" size="20" class="animate-spin" />
                发布
              </Button>
            </div>
            <div v-else class="space-y-4 rounded-lg border p-4">
              <h3 class="font-semibold">
                编辑公告
              </h3>
              <p>创建者：{{ isEditing.creatorId }}</p>
              <p>创建时间：{{ isEditing.createAt }}</p>
              <!-- <p>最后修改时间：{{ isEditing.updateAt }}</p> -->
              <ClientOnly>
                <MdEditor
                  v-model="isEditing.markdown"
                  language="zh-CN"
                  no-upload-img
                  :toolbars="toolbars"
                  preview-theme="github"
                  no-img-zoom-in
                />
              </ClientOnly>
              <Button :disabled="isUpdatePending" @click="updateAnnouncement">
                确认修改
              </Button>
              <Button @click="cancelEdit">
                取消修改
              </Button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <div v-if="isPending">
              <div class="flex h-[calc(100svh-10rem)] w-full flex-col items-center justify-center">
                <Icon name="lucide:loader-2" size="20" class="animate-spin" />
              </div>
            </div>
            <Table v-else>
              <TableHeader>
                <TableRow>
                  <TableHead>发布人</TableHead>
                  <TableHead>可见性</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, index) in announcementList" :key="index">
                  <TableCell>{{ item.creatorId }} ({{ item.creatorName }})</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {{ visibleLabel(item.visible) }}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger as-child>
                        <Button variant="outline">
                          查看
                        </Button>
                      </DialogTrigger>
                      <DialogScrollContent class="sm:max-w-[425px]">
                        <DialogHeader class="p-6 pb-0">
                          <DialogTitle>公告</DialogTitle>
                          <DialogDescription>
                            <p>发布人: {{ item.creatorId }} ({{ item.creatorName }})</p>
                            <p>
                              发布时间:
                              {{ formatDate(item.createdAt) }}
                            </p>
                          </DialogDescription>
                        </DialogHeader>
                        <div
                          class="prose-xl prose-blue prose-pre:bg-zinc-300 prose-pre:text-gray-800 m-1 p-3 text-sm"
                          v-html="$mdRenderer.render(item.markdown)"
                        />
                      </DialogScrollContent>
                    </Dialog>
                  </TableCell>
                  <TableCell>{{ formatDate(item.createdAt) }}</TableCell>
                  <TableCell>
                    <div class="flex gap-2">
                      <!-- <Button size="sm" @click="editAnnouncement" :disabled="userStore.id !== item.creatorId">编辑</Button> -->
                      <AlertDialog>
                        <AlertDialogTrigger as-child>
                          <Button size="sm" variant="destructive" :disable="isRemovePending">
                            <Icon
                              v-if="isRemovePending"
                              name="lucide:loader-2"
                              size="20"
                              class="animate-spin"
                            />
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确定要删除这条公告吗</AlertDialogTitle>
                            <AlertDialogDescription>
                              <p>发布人: {{ item.creatorId }}</p>
                              <p>
                                发布时间:
                                {{ formatDate(item.createdAt) }}
                              </p>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              :disabled="isRemovePending"
                              @click="removePost(item.id)"
                            >
                              <Icon
                                v-if="isRemovePending"
                                name="lucide:loader-2"
                                size="20"
                                class="animate-spin"
                              />
                              确定
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  </SidebarInset>
</template>

<script setup lang="ts">
import { MdEditor, type ToolbarNames } from "md-editor-v3";
import "md-editor-v3/lib/style.css";

const { $trpc } = useNuxtApp();
const { $mdRenderer } = useNuxtApp();
const queryClient = useQueryClient();

definePageMeta({
  layout: "admin",
});

const toolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "-",
  "title",
  "strikeThrough",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  // 'orderedList',
  "task",
  "-",
  "codeRow",
  "code",
  "link",
  // 'image',
  "table",
  // 'mermaid',
  // "katex",
  "-",
  "revoke",
  "next",
  // 'save',
  "=",
  "pageFullscreen",
  "fullscreen",
  "preview",
  "previewOnly",
  "htmlPreview",
  // 'catalog',
  // 'github',
];

const newAnnouncement = ref("# 这是标题\n这是内容");
const newAnnouncementVisibility = ref("");

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function visibleLabel(visible: string): string {
  if (visible === "public")
    return "仅未登录可见";
  if (visible === "all")
    return "公开";
  return "管理员可见";
}

const { data: announcementList, isPending } = useQuery({
  queryFn: () => $trpc.announcement.list.query(),
  queryKey: ["announcement.list"],
  refetchOnWindowFocus: true,
});

const { mutate: post, isPending: isPostPending } = useMutation({
  mutationFn: $trpc.announcement.create.mutate,
  onSuccess: async () => {
    newAnnouncement.value = "";
    newAnnouncementVisibility.value = "";
    queryClient.invalidateQueries({ queryKey: ["announcement.list"] });
    toast.success("发布成功");
  },
  onError: err => useErrorHandler(err),
});

async function postAnnouncement() {
  if (!newAnnouncement.value) {
    toast.error("请填写内容");
    return;
  }
  if (newAnnouncementVisibility.value.length === 0) {
    toast.error("请选择可见用户");
    return;
  }
  post({
    markdown: newAnnouncement.value,
    visible: newAnnouncementVisibility.value,
  });
}

const { mutate: remove, isPending: isRemovePending } = useMutation({
  mutationFn: $trpc.announcement.remove.mutate,
  onSuccess: async () => {
    queryClient.invalidateQueries({ queryKey: ["announcement.list"] });
    toast.success("删除成功");
  },
  onError: err => useErrorHandler(err),
});

function removePost(id: number) {
  remove(id);
}

const isEditing = ref({
  status: false,
  id: -1,
  markdown: "",
  creatorId: "",
  createAt: "",
  updateAt: "",
});

function cancelEdit() {
  isEditing.value.id = -1;
  isEditing.value.markdown = "";
  isEditing.value.status = false;
  newAnnouncementVisibility.value = "";
}

const { mutate: update, isPending: isUpdatePending } = useMutation({
  mutationFn: $trpc.announcement.update.mutate,
  onSuccess: async () => {
    cancelEdit();
    queryClient.invalidateQueries({ queryKey: ["announcement.list"] });
    toast.success("更新成功");
  },
  onError: err => useErrorHandler(err),
});

// function editAnnouncement() {
//   if (isEditing.value.id !== -1 && isEditing.value.markdown !== "") {
//     if (isEditing.value.creatorId !== userStore.id) {
//       toast.error("你没有权限编辑此公告");
//       return;
//     }
//     isEditing.value.status = true;
//   }
// }

async function updateAnnouncement() {
  if (!isEditing.value.markdown) {
    toast.error("请填写内容");
    return;
  }
  update({
    id: isEditing.value.id,
    markdown: isEditing.value.markdown,
  });
}
</script>
