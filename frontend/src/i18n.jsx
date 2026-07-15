import { createContext, useContext, useState } from 'react'

// 中/英雙語：未曾明選時自動偵測瀏覽器語言；使用者明選後記住。
// 各元件以 useI18n() 取得 lang，並就地定義自己的 STRINGS[lang] 字典（就近維護、易於平行開發）。
const I18nContext = createContext({ lang: 'en', setLang: () => {}, toggle: () => {} })

function initialLang() {
    try {
        const saved = localStorage.getItem('ig-app-lang')
        if (saved === 'en' || saved === 'zh') return saved
        return (navigator.language || 'en').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
    } catch {
        return 'en'
    }
}

export function I18nProvider({ children }) {
    const [lang, setLangState] = useState(initialLang)

    const setLang = (l) => {
        if (l !== 'en' && l !== 'zh') return
        try { localStorage.setItem('ig-app-lang', l) } catch { /* ignore */ }
        document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'
        setLangState(l)
    }
    const toggle = () => setLang(lang === 'zh' ? 'en' : 'zh')

    return <I18nContext.Provider value={{ lang, setLang, toggle }}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)

// 小工具：依 lang 從 { en, zh } 物件挑一組字串。
export const pick = (dict, lang) => dict[lang] || dict.en
