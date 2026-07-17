import React, { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useI18n, pick } from '../i18n'

// 平台狀態子頁：即時對 /health 做健康檢查（載入時 + 每 30 秒 + 手動），
// 顯示整體狀態、各服務燈號與量測到的 API 延遲。所有數字走 mono + tabular-nums。
const REFRESH_MS = 30_000

const STRINGS = {
    en: {
        heading: 'System status',
        sub: 'Checked live from your browser against the public health endpoint.',
        operational: 'All systems operational',
        unreachable: 'API unreachable',
        checking: 'Checking...',
        lastChecked: 'Last checked',
        autoRefresh: 'Refreshes every 30 seconds',
        refresh: 'Check now',
        refreshing: 'Checking...',
        services: 'Services',
        apiName: 'Watermarking API',
        apiDesc: 'GET /health',
        webName: 'Web application',
        webDesc: 'This page loaded successfully',
        latency: 'Latency',
        stOperational: 'Operational',
        stUnreachable: 'Unreachable',
        docsHint: 'Integrating with the API? See the developer documentation.',
        docsLink: 'API reference',
    },
    zh: {
        heading: '系統狀態',
        sub: '由你的瀏覽器即時檢查公開的健康檢查端點。',
        operational: '所有系統運作正常',
        unreachable: 'API 無法連線',
        checking: '檢查中...',
        lastChecked: '上次檢查',
        autoRefresh: '每 30 秒自動更新',
        refresh: '立即檢查',
        refreshing: '檢查中...',
        services: '服務',
        apiName: '浮水印 API',
        apiDesc: 'GET /health',
        webName: '網頁應用程式',
        webDesc: '本頁面已成功載入',
        latency: '延遲',
        stOperational: '運作正常',
        stUnreachable: '無法連線',
        docsHint: '要串接 API？請參考開發者文件。',
        docsLink: 'API 參考',
    },
}

const RefreshIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
    </svg>
)

// 狀態藥丸：唯一允許脈動的地方是「即時狀態」語意燈號（設計規範允許）。
function StatusPill({ ok, labelOk, labelBad }) {
    return ok ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold font-mono text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {labelOk}
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold font-mono text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            {labelBad}
        </span>
    )
}

export default function StatusTab() {
    const { lang } = useI18n()
    const t = pick(STRINGS, lang)

    // ok: null=首次檢查中 / true / false；latencyMs 為 /health 來回時間量測值。
    const [ok, setOk] = useState(null)
    const [latencyMs, setLatencyMs] = useState(null)
    const [checkedAt, setCheckedAt] = useState(null)
    const [busy, setBusy] = useState(false)
    const timerRef = useRef(null)

    const check = useCallback(async () => {
        setBusy(true)
        const t0 = performance.now()
        try {
            await api.get('/health')
            setLatencyMs(Math.max(1, Math.round(performance.now() - t0)))
            setOk(true)
        } catch {
            setLatencyMs(null)
            setOk(false)
        } finally {
            setCheckedAt(new Date())
            setBusy(false)
        }
    }, [])

    useEffect(() => {
        check()
        timerRef.current = setInterval(check, REFRESH_MS)
        return () => clearInterval(timerRef.current)
    }, [check])

    const timeStr = checkedAt
        ? checkedAt.toLocaleTimeString(lang === 'zh' ? 'zh-TW' : 'en-US', { hour12: false })
        : null

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* 整體狀態卡 */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden">
                <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                    <div
                        className={`h-12 w-12 shrink-0 rounded-full flex items-center justify-center border ${
                            ok === false
                                ? 'bg-rose-50 border-rose-200'
                                : 'bg-emerald-50 border-emerald-200'
                        }`}
                    >
                        <span
                            className={`h-3 w-3 rounded-full ${
                                ok === null
                                    ? 'bg-slate-300 animate-pulse'
                                    : ok
                                        ? 'bg-emerald-500'
                                        : 'bg-rose-500 animate-pulse'
                            }`}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                            {ok === null ? t.checking : ok ? t.operational : t.unreachable}
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">
                            {timeStr ? (
                                <>
                                    {t.lastChecked}: <span className="font-mono tabular-nums text-slate-700">{timeStr}</span>
                                    <span className="text-slate-300 mx-2">|</span>
                                    {t.autoRefresh}
                                </>
                            ) : (
                                t.autoRefresh
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={check}
                        disabled={busy}
                        className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-[background-color,transform] duration-200 ease-spring hover:bg-slate-50 active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                    >
                        <RefreshIcon className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                        {busy ? t.refreshing : t.refresh}
                    </button>
                </div>
            </div>

            {/* 服務列表 */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/60">
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">{t.services}</h3>
                </div>
                <ul className="divide-y divide-slate-100">
                    <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:px-6">
                        <div className="min-w-0">
                            <div className="font-medium text-slate-900">{t.apiName}</div>
                            <div className="mt-0.5 text-xs font-mono text-slate-400">{t.apiDesc}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            {ok && latencyMs != null && (
                                <span className="text-xs text-slate-500">
                                    {t.latency}: <span className="font-mono tabular-nums text-slate-700">{latencyMs} ms</span>
                                </span>
                            )}
                            {ok === null ? (
                                <div className="skeleton h-6 w-24 rounded-full" />
                            ) : (
                                <StatusPill ok={ok} labelOk={t.stOperational} labelBad={t.stUnreachable} />
                            )}
                        </div>
                    </li>
                    <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:px-6">
                        <div className="min-w-0">
                            <div className="font-medium text-slate-900">{t.webName}</div>
                            <div className="mt-0.5 text-xs font-mono text-slate-400">{t.webDesc}</div>
                        </div>
                        <div className="shrink-0">
                            <StatusPill ok labelOk={t.stOperational} labelBad={t.stUnreachable} />
                        </div>
                    </li>
                </ul>
            </div>

            {/* 導向開發者文件（子頁互聯） */}
            <p className="text-sm text-slate-500 text-center">
                {t.docsHint}{' '}
                <a
                    href="#developers"
                    className="font-medium text-blue-600 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none rounded"
                >
                    {t.docsLink}
                </a>
            </p>
        </div>
    )
}
