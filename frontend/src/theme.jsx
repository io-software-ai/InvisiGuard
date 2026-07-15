import { createContext, useContext, useEffect, useState } from 'react'

// 深/淺主題（class 策略）：未曾明選時自動偵測 OS 偏好，並在 OS 切換時即時跟隨；
// 使用者一旦明選則記住其選擇並覆蓋 OS。與落地頁的行為一致。
const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

function initialTheme() {
    try {
        const saved = localStorage.getItem('ig-app-theme')
        if (saved === 'dark' || saved === 'light') return saved
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
        return 'light'
    }
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(initialTheme)

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
    }, [theme])

    // 未明選時跟隨系統即時變化
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = (e) => {
            if (!localStorage.getItem('ig-app-theme')) setTheme(e.matches ? 'dark' : 'light')
        }
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    const toggle = () => {
        setTheme((prev) => {
            const next = prev === 'dark' ? 'light' : 'dark'
            try { localStorage.setItem('ig-app-theme', next) } catch { /* ignore */ }
            return next
        })
    }

    return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
