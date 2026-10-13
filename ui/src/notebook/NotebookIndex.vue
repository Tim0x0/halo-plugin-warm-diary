<script setup lang="ts">
import IconSearch from '~icons/ri/search-line'
import IconExpand from '~icons/ri/arrow-down-s-line'
import IconPrevious from '~icons/ri/arrow-left-s-line'
import IconNext from '~icons/ri/arrow-right-s-line'
import IconHeart from '~icons/ri/heart-3-line'
import { longDate, monthTitle, shortDate, title } from '../diary/api'
import { weekdays } from './calendar'
import { statusLabel } from '../diary/wording'
import type { Notebook } from './useNotebook'

// 手帐左侧：搜索、日历筛选、目录、分页和便笺。状态都在 useNotebook 里，这里只负责展示。
const props = defineProps<{ notebook: Notebook; stickyNote: string }>()
const emit = defineEmits<{ open: [entry: { name: string }] }>()
const {
  session,
  mine,
  loading,
  editing,
  entries,
  total,
  page,
  size,
  selected,
  keyword,
  visibility,
  month,
  selectedDate,
  showFilters,
  calendarMonth,
  calendar,
  calendarError,
  calendarDays,
  accessible,
  filtered,
  filterSummary,
  listing,
  monthLabel,
  loadCalendar,
  filter,
  reset,
  chooseDate,
  chooseMonth,
  turnCalendar,
  turn,
} = props.notebook
</script>

<template>
  <aside class="nb-index">
    <div class="nb-index-title">
      {{ monthLabel }}<span v-if="!filtered && !listing" class="nb-index-count">{{ total }} 篇</span
      ><span class="nb-eyebrow">{{ mine ? 'FOR MYSELF' : 'SHARED PAGES' }}</span>
    </div>
    <p class="nb-index-sub nb-eyebrow">LITTLE THINGS, BIG MEMORIES</p>
    <template v-if="accessible && !editing">
      <form class="nb-search" role="search" @submit.prevent="filter">
        <input
          v-model="keyword"
          type="search"
          placeholder="翻找一段记忆"
          aria-label="搜索日记"
          maxlength="200"
        /><button type="submit" class="nb-icon-btn" aria-label="搜索">
          <IconSearch aria-hidden="true" />
        </button>
      </form>
      <button
        class="nb-filter-toggle"
        :aria-expanded="showFilters"
        @click="showFilters = !showFilters"
      >
        日历与筛选<IconExpand aria-hidden="true" />
      </button>
      <div v-if="showFilters" class="nb-filters">
        <label v-if="mine"
          >状态<select v-model="visibility" class="nb-select" @change="filter">
            <option value="all">全部</option>
            <option value="public">已分享</option>
            <option value="private">写给自己</option>
          </select></label
        >
        <div class="nb-calendar-head">
          <button class="nb-icon-btn" aria-label="上一月" @click="turnCalendar(-1)">
            <IconPrevious aria-hidden="true" /></button
          ><button
            class="nb-calendar-month"
            :aria-pressed="!!month && month === calendarMonth"
            :class="{ 'is-picked': !!month && month === calendarMonth }"
            :title="month === calendarMonth ? '取消按月筛选' : '只看这个月'"
            @click="chooseMonth"
          >
            {{ monthTitle(calendarMonth) }}</button
          ><button class="nb-icon-btn" aria-label="下一月" @click="turnCalendar(1)">
            <IconNext aria-hidden="true" />
          </button>
        </div>
        <div class="nb-calendar">
          <span v-for="(day, index) in weekdays" :key="index">{{ day }}</span>
          <template v-for="(date, index) in calendarDays" :key="index"
            ><button
              v-if="date"
              :aria-label="`${longDate(date)}${calendar[date] ? '，有 ' + calendar[date] + ' 篇日记' : ''}`"
              :aria-pressed="selectedDate === date"
              :class="{
                'is-recorded': calendar[date],
                'is-picked': selectedDate === date,
                'is-today': session?.today === date,
              }"
              @click="chooseDate(date)"
            >
              {{ Number(date.slice(8)) }}</button
            ><span v-else></span
          ></template>
        </div>
      </div>
      <div v-if="filtered" class="nb-filter-summary">
        <span
          >{{ filterSummary }}<template v-if="!listing"> · {{ total }} 篇</template></span
        ><button class="nb-link" @click="reset">清除</button>
      </div>
      <div v-if="calendarError" class="nb-error" role="alert">
        {{ calendarError }}<button class="nb-link" @click="loadCalendar()">重试日历</button>
      </div>
      <div class="nb-entry-list" aria-label="日记目录">
        <button
          v-for="entry in entries"
          :key="entry.name"
          class="nb-entry"
          :class="{ 'is-selected': selected?.name === entry.name }"
          :aria-pressed="selected?.name === entry.name"
          @click="emit('open', entry)"
        >
          <span class="nb-entry-day">{{ entry.date.slice(8) }}</span
          ><span class="nb-entry-words"
            ><small>{{ shortDate(entry.date) }}</small
            ><strong>{{ title(entry) }}</strong
            ><span
              v-if="'version' in entry"
              class="nb-entry-status"
              :class="entry.shared ? 'is-shared' : 'is-private'"
              ><i v-if="entry.pendingChanges" class="nb-dot" aria-hidden="true"></i
              >{{ statusLabel(entry) }}</span
            ></span
          >
        </button>
      </div>
      <div v-if="total > size" class="nb-pagination">
        <button
          class="nb-icon-btn"
          :disabled="page <= 1 || loading"
          aria-label="上一页"
          @click="turn(-1)"
        >
          <IconPrevious aria-hidden="true" /></button
        ><span>{{ page }} / {{ Math.ceil(total / size) }}</span
        ><button
          class="nb-icon-btn"
          :disabled="page * size >= total || loading"
          aria-label="下一页"
          @click="turn(1)"
        >
          <IconNext aria-hidden="true" />
        </button>
      </div>
    </template>
    <div class="nb-sticky">
      {{ stickyNote
      }}<small class="nb-eyebrow">NOTE TO MYSELF <IconHeart aria-hidden="true" /></small>
    </div>
  </aside>
</template>
