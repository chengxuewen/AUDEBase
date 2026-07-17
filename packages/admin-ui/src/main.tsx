import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { I18nProvider } from './i18n/index.js'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(<I18nProvider><App /></I18nProvider>)
