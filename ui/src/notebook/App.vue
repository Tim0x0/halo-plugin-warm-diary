<script setup lang="ts">
import { defineAsyncComponent, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import IconLeave from '~icons/ri/arrow-right-up-line'
import IconEdit from '~icons/ri/edit-line'
import IconShare from '~icons/ri/share-forward-line'
import IconUnshare from '~icons/ri/eye-off-line'
import IconDelete from '~icons/ri/delete-bin-line'
import { changedLabel, title, type Entry } from '../diary/api'
import {
  confirmDescription,
  confirmTitles,
  isDanger,
  isShared,
  operationLabels,
  shareLabel,
  shareNote,
} from '../diary/wording'
import { useNotebook } from './useNotebook'
import NotebookIndex from './NotebookIndex.vue'
import NotebookDialog from './NotebookDialog.vue'
import NotebookPage from './NotebookPage.vue'
import SunMark from './SunMark.vue'
const NotebookWriter = defineAsyncComponent(() => import('./NotebookWriter.vue'))
const stickyNote =
  (typeof document !== 'undefined' &&
    document.getElementById('warm-diary-sticky')?.textContent?.trim()) ||
  '不必写得漂亮，\n真实就很好。'
const writer = ref<{ canLeave: () => Promise<boolean> }>()
const sheet = ref<HTMLElement>()
const notebook = useNotebook(() => writer.value?.canLeave() ?? Promise.resolve(true))
const {
  session,
  mine,
  visitorView,
  directory,
  loading,
  opening,
  error,
  busy,
  editing,
  selected,
  editEntry,
  draftName,
  publishing,
  actionError,
  privateEntry,
  content,
  accessible,
  filtered,
  load,
  pick,
  reset,
  switchView,
  write,
  saved,
  closeWriter,
  action,
} = notebook
type Confirmed = 'unpublish' | 'trash'
const confirming = ref<{ entry: Entry; operation: Confirmed }>()
async function open(entry: { name: string }) {
  await pick(entry)
  await nextTick()
  // 在长目录里往下翻过之后，把打开的这一页带回视野。
  if (sheet.value && sheet.value.getBoundingClientRect().top < 0) {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    sheet.value.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
  }
}
function preview(entry: Entry) {
  actionError.value = ''
  publishing.value = entry
}
function confirmAction(entry: Entry, operation: Confirmed) {
  if (busy.value) return
  actionError.value = ''
  confirming.value = { entry, operation }
}
async function confirmed() {
  const target = confirming.value
  if (!target) return
  await action(target.entry, target.operation)
  if (!actionError.value) confirming.value = undefined
}
</script>

<template>
  <div class="warm-notebook">
    <header class="nb-top">
      <RouterLink class="nb-brand" :to="directory"><SunMark />暖阳日记</RouterLink>
      <div class="nb-top-actions">
        <span class="nb-top-note">今天，也有好好生活。</span
        ><template v-if="session?.canManage"
          ><button
            v-if="!editing"
            class="nb-link"
            :disabled="loading || busy"
            :aria-pressed="visitorView"
            @click="switchView(!visitorView)"
          >
            {{ visitorView ? '退出访客预览' : '访客预览' }}
          </button>
          <button v-if="mine && !editing" class="nb-btn" @click="write()">写日记</button></template
        ><a v-else-if="session?.loggedIn" class="nb-link" href="/uc">我的账号</a>
        <a v-else class="nb-link" href="/login?redirect_uri=/diary">站长登录</a>
      </div>
    </header>
    <p v-if="visitorView" class="nb-notice" role="status">正在预览访客看到的内容</p>
    <div
      v-if="actionError && !publishing && !confirming"
      class="nb-error nb-global-error"
      role="alert"
    >
      {{ actionError }}
    </div>
    <main class="nb-book" :class="{ 'is-writing': editing }">
      <NotebookIndex :notebook="notebook" :sticky-note="stickyNote" @open="open" />
      <article ref="sheet" class="nb-sheet">
        <NotebookWriter
          v-if="editing && session"
          ref="writer"
          :key="draftName"
          :name="draftName"
          :entry="editEntry"
          :today="session.today"
          @saved="saved"
          @close="closeWriter"
        />
        <div v-else-if="loading" class="nb-empty" role="status">正在翻开日记…</div>
        <div v-else-if="error" class="nb-empty" role="alert">
          <h1>这一页暂时打不开</h1>
          <p>{{ error }}</p>
          <button class="nb-btn" @click="load()">重试</button
          ><RouterLink class="nb-link" :to="directory">返回日记目录</RouterLink>
        </div>
        <div v-else-if="!accessible" class="nb-empty">
          <h1>写给自己的日子</h1>
          <p>
            {{
              session?.loggedIn ? '当前账号没有日记管理权限。' : '登录站长账号后，才能写日记。'
            }}
          </p>
          <a v-if="session?.loggedIn" class="nb-btn" href="/uc">管理当前账号</a>
          <a v-else class="nb-btn" href="/login?redirect_uri=/diary/write">站长登录</a
          ><RouterLink class="nb-link" to="/diary">看看分享的日记</RouterLink>
        </div>
        <template v-else-if="content && selected">
          <NotebookPage
            :content="content"
            :status="
              privateEntry
                ? { published: !!privateEntry.published, pending: privateEntry.pendingChanges }
                : undefined
            "
          />
          <div v-if="opening" class="nb-opening" role="status" aria-live="polite">正在打开…</div>
          <footer class="nb-page-foot">
            <span>愿每一个小小的日常，都有回声。</span>
            <div v-if="privateEntry && !privateEntry.trashedAt" class="nb-page-actions">
              <button class="nb-action" :disabled="busy" @click="write(privateEntry)">
                <IconEdit aria-hidden="true" />编辑</button
              ><button
                v-if="!privateEntry.published || privateEntry.pendingChanges"
                class="nb-action"
                :disabled="busy"
                @click="preview(privateEntry)"
              >
                <IconShare aria-hidden="true" />{{ shareLabel(privateEntry) }}</button
              ><button
                v-if="privateEntry.published"
                class="nb-action"
                :disabled="busy"
                @click="confirmAction(privateEntry, 'unpublish')"
              >
                <IconUnshare aria-hidden="true" />{{ operationLabels.unpublish }}</button
              ><button
                class="nb-action is-danger"
                :disabled="busy"
                @click="confirmAction(privateEntry, 'trash')"
              >
                <IconDelete aria-hidden="true" />{{ operationLabels.trash }}
              </button>
            </div>
          </footer>
        </template>
        <div v-else class="nb-empty">
          <SunMark />
          <h1>
            {{ filtered ? '没有找到这段记忆' : mine ? '把今天留在这一页' : '这里还没有分享的日记' }}
          </h1>
          <p>
            {{
              filtered
                ? '换个关键词或日期，再翻一翻吧。'
                : mine
                  ? '几句话，也是一段值得留住的生活。'
                  : '等一阵风，也等一段愿意分享的日常。'
            }}
          </p>
          <button v-if="filtered" class="nb-btn" @click="reset">清除筛选</button
          ><button v-else-if="mine" class="nb-btn is-primary" @click="write()">写日记</button>
        </div>
      </article>
    </main>
    <footer class="nb-bottom">
      <span>一本日记，收好生活里的小小暖意。</span
      ><a v-if="session?.canManage" href="/console/warm-diary"
        >Halo 管理后台<IconLeave aria-hidden="true" /></a
      ><a v-else href="/">回到首页<IconLeave aria-hidden="true" /></a>
    </footer>
    <NotebookDialog
      v-if="publishing"
      wide
      :title="isShared(publishing) ? '更新分享' : '分享日记'"
      @close="publishing = undefined"
    >
      <div v-if="actionError" class="nb-error" role="alert">{{ actionError }}</div>
      <p class="nb-dialog-note">
        {{ shareNote(publishing)
        }}<template v-if="publishing.published && publishing.changedFields.length"
          >改动了：{{ changedLabel(publishing.changedFields) }}。</template
        >
      </p>
      <div class="nb-preview"><NotebookPage :content="publishing.working" /></div>
      <template #footer
        ><button class="nb-btn" :disabled="busy" @click="publishing = undefined">取消</button
        ><button class="nb-btn is-primary" :disabled="busy" @click="action(publishing, 'publish')">
          {{ busy ? '正在分享…' : shareLabel(publishing) }}
        </button></template
      >
    </NotebookDialog>
    <NotebookDialog
      v-if="confirming"
      :title="confirmTitles[confirming.operation]"
      @close="confirming = undefined"
    >
      <div v-if="actionError" class="nb-error" role="alert">{{ actionError }}</div>
      <p>
        {{ confirmDescription(confirming.operation, `“${title(confirming.entry.working)}”`) }}
      </p>
      <template #footer
        ><button class="nb-btn" :disabled="busy" @click="confirming = undefined">取消</button
        ><button
          class="nb-btn"
          :class="isDanger(confirming.operation) ? 'is-danger' : 'is-primary'"
          :disabled="busy"
          @click="confirmed"
        >
          {{ operationLabels[confirming.operation] }}
        </button></template
      >
    </NotebookDialog>
  </div>
</template>
