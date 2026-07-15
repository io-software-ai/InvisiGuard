import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted Geist (variable), no CDN. Mono carries numerics / IDs / code.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import App from './App.jsx'
import { ThemeProvider } from './theme'
import { I18nProvider } from './i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
