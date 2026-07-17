import React, { useEffect, useRef, useState } from 'react'
import { useI18n, pick } from '../i18n'

// 使用者導向的攻擊分類標籤與燈號配色。
const CATEGORY_LABELS = {
    jpeg: { en: 'JPEG Compression', zh: 'JPEG 壓縮' },
    resize: { en: 'Resize', zh: '縮放' },
    crop: { en: 'Crop', zh: '裁切' },
    rotate: { en: 'Rotate', zh: '旋轉' },
    noise: { en: 'Noise', zh: '雜訊' },
}

const STATUS_STYLE = {
    high: {
        dot: 'bg-emerald-500',
        chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        label: { en: 'High', zh: '高' },
    },
    mid: {
        dot: 'bg-amber-500',
        chip: 'bg-amber-50 text-amber-700 border-amber-200',
        label: { en: 'Medium', zh: '中' },
    },
    low: {
        dot: 'bg-rose-500',
        chip: 'bg-rose-50 text-rose-700 border-rose-200',
        label: { en: 'Low', zh: '低' },
    },
}

const STRINGS = {
    en: {
        title: 'Robustness Report',
        subtitle: 'Measured, not claimed',
        survivedOfTotal: 'Survived Attacks',
        overallSurvivalRate: 'Overall Survival Rate',
        retained: 'Retained',
        failed: 'Failed',
        defaultNote: 'Results from a live battery of attack tests.',
    },
    zh: {
        title: '穩健度實測報告',
        subtitle: '實測，非宣稱',
        survivedOfTotal: '攻擊下存活',
        overallSurvivalRate: '整體存活率',
        retained: '留存',
        failed: '失效',
        defaultNote: '實際攻擊測試的結果。',
    },
}

// 偵測使用者是否要求減少動態效果(reduced-motion 時所有動效直接跳到終值)。
const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * R5 數字滾動:純呈現用的 rAF 計數,從 0 滾到目標值(約 0.8 秒, ease-out)。
 * enabled 為 false 時直接顯示終值(reduced-motion)。不觸碰任何資料流。
 */
function useCountUp(target, enabled, duration = 800) {
    const [value, setValue] = useState(enabled ? 0 : target)
    useEffect(() => {
        if (!enabled) {
            setValue(target)
            return
        }
        let raf
        const start = performance.now()
        const tick = (now) => {
            const p = Math.min((now - start) / duration, 1)
            const eased = 1 - Math.pow(1 - p, 3)
            setValue(Math.round(target * eased))
            if (p < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [target, enabled, duration])
    return value
}

/**
 * 實測穩健性證書:把「這個浮水印在被壓縮/縮放/裁切/旋轉後還在不在」的伺服器端
 * 實測結果,做成用戶當場看得到的燈號 + 逐項清單。這是產品的差異化核心。
 */
export default function RobustnessCertificate({ robustness }) {
    const { lang } = useI18n()
    const t = pick(STRINGS, lang)

    const valid = !!(robustness && Array.isArray(robustness.attacks))
    const survivedTarget = valid ? (robustness.survived ?? 0) : 0
    const scorePct = valid ? Math.round((robustness.score ?? 0) * 100) : 0

    // 純呈現用的動效狀態:reveal 觸發分數條填滿(R5)與逐列進場(R4)。
    const reduceMotion = useRef(prefersReducedMotion()).current
    const [revealed, setRevealed] = useState(reduceMotion)
    useEffect(() => {
        if (reduceMotion) return
        // 等第一幀畫完初始狀態(width 0 / opacity 0)再切換,transition 才會生效。
        let raf2
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => setRevealed(true))
        })
        return () => {
            cancelAnimationFrame(raf1)
            if (raf2) cancelAnimationFrame(raf2)
        }
    }, [reduceMotion])

    const survivedShown = useCountUp(survivedTarget, valid && !reduceMotion)
    const scorePctShown = useCountUp(scorePct, valid && !reduceMotion)

    if (!valid) return null

    const { attacks, total, categories, note } = robustness

    return (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden animate-fade-up">
            <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-blue-50 border border-blue-100 text-blue-600">
                        <ShieldIcon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900 truncate">
                            {t.title}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {t.subtitle}
                        </p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-2xl font-semibold font-mono tabular-nums tracking-tight text-slate-900">
                        {survivedShown}<span className="text-slate-400">/{total}</span>
                    </div>
                    <div className="text-[11px] font-medium tracking-wide text-slate-400 mt-0.5">{t.survivedOfTotal}</div>
                </div>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
                {/* 分類燈號 */}
                <div className="flex flex-wrap gap-2">
                    {Object.entries(categories || {}).map(([cat, status]) => {
                        const s = STATUS_STYLE[status] || STATUS_STYLE.low
                        return (
                            <span
                                key={cat}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${s.chip}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                {pick(CATEGORY_LABELS[cat] || { en: cat, zh: cat }, lang)}
                                <span className="opacity-60">{pick(s.label, lang)}</span>
                            </span>
                        )
                    })}
                </div>

                {/* 存活分數條:數字 R5 滾動,長條在 reveal 後從 0 以 glide 填滿 */}
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs font-medium text-slate-500">{t.overallSurvivalRate}</span>
                        <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">{scorePctShown}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-[width] duration-700 ease-glide ${scorePct >= 60 ? 'bg-emerald-500' : scorePct >= 30 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: revealed ? `${Math.max(scorePct, 3)}%` : '0%' }}
                        />
                    </div>
                </div>

                {/* 逐項攻擊結果:R4 依序進場(每列延遲 60ms) */}
                <ul className="divide-y divide-slate-100">
                    {attacks.map((a, i) => (
                        <li
                            key={a.key}
                            className={`flex items-center justify-between gap-3 py-3 text-sm transition-[opacity,transform] duration-[450ms] ease-glide ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[14px]'}`}
                            style={{ transitionDelay: reduceMotion ? '0ms' : `${i * 60}ms` }}
                        >
                            <span className="flex items-center gap-2.5 text-slate-700 min-w-0">
                                <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${a.survived ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <span className="truncate">{a.label}</span>
                            </span>
                            {a.survived ? (
                                <span className="inline-flex items-center gap-1.5 shrink-0 text-emerald-600 font-medium">
                                    <CheckIcon className="w-4 h-4" /> {t.retained}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 shrink-0 text-slate-400 font-medium">
                                    <CrossIcon className="w-4 h-4" /> {t.failed}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>

                {/* 誠實揭露 */}
                <p className="max-w-[65ch] text-xs text-slate-400 leading-relaxed border-t border-slate-100 pt-4">
                    {note || t.defaultNote}
                </p>
            </div>
        </div>
    )
}

const ShieldIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
    </svg>
)
const CheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M20 6 9 17l-5-5" />
    </svg>
)
const CrossIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M18 6 6 18M6 6l12 12" />
    </svg>
)
