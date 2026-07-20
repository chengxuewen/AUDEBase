import { initReactI18next, I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import type { i18n as I18nInstance } from 'i18next'
import type { ReactNode } from 'react'
import zhCN from './locales/zh-CN.json' with { type: 'json' }

export const defaultNS = 'client'

export const i18n: I18nInstance = i18next.createInstance()

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': {
      client: zhCN,
    },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  defaultNS,
  ns: ['client'],
  interpolation: {
    escapeValue: false,
  },
})

interface I18nProviderProps {
  children: ReactNode
}

export function I18nProvider({ children }: I18nProviderProps): ReactNode {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
