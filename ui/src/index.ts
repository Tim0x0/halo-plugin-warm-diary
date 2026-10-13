import { definePlugin } from '@halo-dev/ui-shared'
import { markRaw } from 'vue'
import IconDiary from '~icons/ri/booklet-line'

export default definePlugin({
  components: {},
  routes: [
    {
      parentName: 'Root',
      route: {
        path: '/warm-diary/deleted',
        name: 'WarmDiaryTrash',
        component: () => import('./views/DiaryConsoleView.vue'),
        meta: { title: '日记回收站', searchable: false, permissions: ['*'] },
      },
    },
    {
      parentName: 'Root',
      route: {
        path: '/warm-diary',
        name: 'WarmDiary',
        component: () => import('./views/DiaryConsoleView.vue'),
        meta: {
          title: '日记',
          searchable: true,
          permissions: ['*'],
          menu: {
            name: '日记',
            group: 'content',
            icon: markRaw(IconDiary),
            priority: 0,
          },
        },
      },
    },
  ],
  extensionPoints: {},
})
