import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import App from './App.vue'

export function createNotebookRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/diary', component: App },
      { path: '/diary/entry/:id', component: App },
      { path: '/diary/write', component: App },
    ],
  })
}
