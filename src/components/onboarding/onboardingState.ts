import { create } from 'zustand'
import { openSettings } from '../settings/settingsDialogState.js'

/** 引导弹窗的步骤：询问是否已有 Key / 获取步骤 / 数据存储说明 */
export type OnboardingStage = 'ask' | 'steps' | 'storage'

export const useOnboarding = create<{ stage: OnboardingStage | null }>(() => ({ stage: null }))

export const openOnboarding = (stage: OnboardingStage) => useOnboarding.setState({ stage })

export const closeOnboarding = () => useOnboarding.setState({ stage: null })

/** 关闭引导并打开设置里 API Key 所在的「数据管理」分组 */
export const goToApiKeySettings = () => {
  closeOnboarding()
  openSettings('data')
}