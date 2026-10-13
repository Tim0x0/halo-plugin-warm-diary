import { axiosInstance } from '@halo-dev/api-client'
import { Configuration, DiaryV1alpha1ConsoleApi, DiaryV1alpha1PublicApi } from './generated'

// 手帐是独立页面；让 Halo 返回 401，而不是跳转到登录 HTML。
const configuration = new Configuration({
  baseOptions: { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
})

export const diaryConsoleApiClient = {
  entry: new DiaryV1alpha1ConsoleApi(configuration, '', axiosInstance),
}

export const diaryPublicApiClient = {
  entry: new DiaryV1alpha1PublicApi(configuration, '', axiosInstance),
}

export * from './generated'
