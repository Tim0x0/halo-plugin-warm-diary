<script setup lang="ts">
import IconShared from '~icons/ri/eye-line'
import IconPrivate from '~icons/ri/eye-off-line'
import { longDate, title, type Content } from '../diary/api'
import { pendingLabel } from '../diary/wording'

// 一页日记的正文。阅读页和分享预览共用，预览看到的就是访客看到的样子。
defineProps<{
  content: Pick<Content, 'date' | 'title' | 'html' | 'mood' | 'weather'> & { text?: string }
  /** 只有管理账号看得到的分享状态；访客页和预览不传。 */
  status?: { published: boolean; pending: boolean }
}>()
</script>

<template>
  <div class="nb-page">
    <div class="nb-page-head">
      <span class="nb-eyebrow">MY LITTLE DAYS / {{ content.date.slice(0, 7) }}</span
      ><span class="nb-page-no">p. {{ content.date.slice(8) }}</span>
    </div>
    <div class="nb-date-line">
      <span class="nb-date">{{ longDate(content.date) }}</span
      ><span
        v-if="content.weather"
        class="nb-stamp"
        :class="{ 'is-long': content.weather.length > 1 }"
        :title="'天气：' + content.weather"
        >{{ content.weather }}</span
      >
    </div>
    <h1 class="nb-title">{{ title(content) }}</h1>
    <div v-if="content.mood || status" class="nb-meta">
      <span v-if="content.mood">心情 · {{ content.mood }}</span>
      <template v-if="status"
        ><span v-if="status.published" class="nb-status is-shared"
          ><IconShared aria-hidden="true" />已分享</span
        ><span v-else class="nb-status is-private"><IconPrivate aria-hidden="true" />写给自己</span
        ><span v-if="status.pending" class="nb-status is-pending"
          ><i class="nb-dot" aria-hidden="true"></i>{{ pendingLabel }}</span
        ></template
      >
    </div>
    <div class="nb-ruled nb-prose" v-html="content.html"></div>
  </div>
</template>
