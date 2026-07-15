import React from 'react'
import { useI18n, pick } from '../i18n'
import { ENGINE_CLASSIC, ENGINE_TRUSTMARK } from '../utils/validation'

// 兩軌浮水印引擎的簡短說明。與 ConfigPanel 的其他中英混排元件不同，這裡改成
// 「依語言顯示單一語言」（不中英並列），閱讀起來更像原生文案而非機器翻譯。
const STRINGS = {
    en: {
        title: 'Watermark Engine',
        options: {
            [ENGINE_CLASSIC]: {
                label: 'Classic',
                description: 'High capacity (up to 92 bytes), crop-resistant, and runs without a GPU.',
            },
            [ENGINE_TRUSTMARK]: {
                label: 'TrustMark AI',
                description: 'Survives JPEG recompression and resizing, built for sharing on social platforms.',
            },
        },
    },
    zh: {
        title: '浮水印引擎',
        options: {
            [ENGINE_CLASSIC]: {
                label: '傳統浮水印',
                description: '高容量（最多 92 bytes）・抗裁切・免 GPU。',
            },
            [ENGINE_TRUSTMARK]: {
                label: '深度學習浮水印',
                description: '抗 JPEG 重壓縮／縮放，適合社群平台流通。',
            },
        },
    },
}

const ENGINE_IDS = [ENGINE_CLASSIC, ENGINE_TRUSTMARK]

// 供其他元件（如 ConfigPanel 的用途快選提示）取得與此處一致的引擎顯示名稱，
// 避免同一顆引擎的名字在不同元件各寫一份翻譯而彼此漂移。
export function getEngineLabel(engineId, lang) {
    const t = pick(STRINGS, lang)
    return t.options[engineId]?.label ?? engineId
}

export default function EngineSelector({ engine, onChange, disabled = false, className = '' }) {
    const { lang } = useI18n()
    const t = pick(STRINGS, lang)

    return (
        <div className={className}>
            <label className="block text-sm font-semibold tracking-tight text-slate-700 dark:text-slate-200 mb-2.5">
                {t.title}
            </label>
            <div role="radiogroup" aria-label={t.title} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ENGINE_IDS.map((id) => {
                    const opt = t.options[id]
                    const isActive = engine === id
                    return (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            disabled={disabled}
                            onClick={() => onChange(id)}
                            className={`
                                group text-left px-4 py-3.5 rounded-xl border transition-all duration-200 active:scale-[0.99]
                                ${isActive
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-card ring-1 ring-inset ring-blue-500/20'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-card-hover'}
                                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5'}
                            `}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-semibold tracking-tight ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {opt.label}
                                </span>
                                <span
                                    aria-hidden="true"
                                    className={`h-2 w-2 shrink-0 rounded-full transition-all duration-200 ${isActive ? 'bg-blue-500 dark:bg-blue-400 ring-2 ring-blue-500/20 dark:ring-blue-400/20' : 'bg-slate-200 dark:bg-slate-700'}`}
                                />
                            </div>
                            <p className={`mt-1.5 text-xs leading-snug ${isActive ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{opt.description}</p>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
