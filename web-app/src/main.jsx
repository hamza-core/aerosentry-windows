import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './components/ui'
import { SessionProvider } from './state/session'
import { applyAppearance } from './lib/theme'
import '@fontsource-variable/inter'
import './styles/theme.css'
import './styles/app.css'

applyAppearance()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
