import { createApp, h } from 'vue'
import { RouterView } from 'vue-router'
import { createNotebookRouter } from '../src/notebook/router'
import '../src/notebook/notebook.css'

// 访客只加载手帐自己的样式；Halo 组件和编辑器样式随写日记页按需加载。
const router = createNotebookRouter()
const app = createApp({ render: () => h(RouterView) })
app.use(router)
void router.isReady().then(() => app.mount('#app'))
