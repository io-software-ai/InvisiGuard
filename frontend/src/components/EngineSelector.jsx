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

// 卡片同時需要兩種緩動：按壓形變走 spring（彈性回饋）、邊框/底色/陰影的
// 選取狀態切換走 glide（平滑減速），故用 arbitrary transition 一次宣告。
const CARD_TRANSITION =
    '[transition:transform_.2s_cubic-bezier(0.34,1.56,0.64,1),border-color_.3s_cubic-bezier(0.16,1,0.3,1),background-color_.3s_cubic-bezier(0.16,1,0.3,1),box-shadow_.3s_cubic-bezier(0.16,1,0.3,1)]'

export default function EngineSelector({ engine, onChange, disabled = false, className = '' }) {
    const { lang } = useI18n()
    const t = pick(STRINGS, lang)

    return (
        <div className={className}>
            <label className="block text-sm font-semibold tracking-tight text-slate-700 mb-2.5">
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
                                group text-left px-4 py-3.5 rounded-xl border ${CARD_TRANSITION}
                                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500
                                ${isActive
                                    ? 'border-blue-500 bg-blue-50 shadow-card ring-1 ring-inset ring-blue-500/20'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card-hover'}
                                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.96]'}
                            `}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-semibold tracking-tight transition-colors duration-300 ease-glide ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                                    {opt.label}
                                </span>
                                <span
                                    aria-hidden="true"
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 ease-glide ${isActive ? 'border-blue-600' : 'border-slate-300 group-hover:border-slate-400'}`}
                                >
                                    <span
                                        className={`block h-2 w-2 rounded-full bg-blue-600 transition-transform duration-200 ease-spring ${isActive ? 'scale-100' : 'scale-0'}`}
                                    />
                                </span>
                            </div>
                            <p className={`mt-1.5 text-xs leading-snug transition-colors duration-300 ease-glide ${isActive ? 'text-slate-600' : 'text-slate-500'}`}>{opt.description}</p>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
