import React, { useEffect } from 'react'

// error 用 rose、success 用 emerald、info 用 blue，沿用專案既有 Tailwind 色彩語彙。
const TOAST_STYLES = {
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
}

const TOAST_ICON = {
    error: (
        <svg className="w-5 h-5 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
    ),
    success: (
        <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
    ),
    info: (
        <svg className="w-5 h-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a1 1 0 100 2 1 1 0 000-2zm-1 4a1 1 0 012 0v4a1 1 0 01-2 0V9z" clipRule="evenodd" />
        </svg>
    ),
}

const DEFAULT_DURATION_MS = 6000

function ToastItem({ id, type = 'info', message, onClose, duration = DEFAULT_DURATION_MS }) {
    useEffect(() => {
        const timer = setTimeout(() => onClose(id), duration)
        return () => clearTimeout(timer)
    }, [id, duration, onClose])

    return (
        <div
            role="status"
            className={`
                pointer-events-auto flex items-start gap-3 w-full max-w-sm px-4 py-3.5
                rounded-xl border shadow-card-hover
                animate-in fade-in slide-in-from-right-8 zoom-in-95 duration-500 ease-spring
                ${TOAST_STYLES[type] || TOAST_STYLES.info}
            `}
        >
            <div className="shrink-0 mt-0.5">{TOAST_ICON[type] || TOAST_ICON.info}</div>
            <div className="flex-1 text-sm font-medium leading-relaxed whitespace-pre-line">{message}</div>
            <button
                type="button"
                onClick={() => onClose(id)}
                aria-label="關閉通知"
                className="shrink-0 -mr-1 -mt-0.5 grid place-items-center rounded-md p-1 text-current/50 transition-all duration-200 ease-spring hover:text-current hover:bg-current/10 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
            >
                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
    )
}

/**
 * 可疊加、可手動關閉的非阻斷通知堆疊，取代全站阻斷式 alert()。
 * aria-live="polite" 讓螢幕報讀軟體在不打斷使用者當前操作的情況下播報新通知。
 */
export default function ToastContainer({ toasts, removeToast }) {
    if (!toasts || toasts.length === 0) return null

    return (
        <div
            aria-live="polite"
            aria-atomic="false"
            className="fixed bottom-4 right-4 z-[100] flex flex-col gap-3 items-end pointer-events-none"
        >
            {toasts.map((toast) => (
                <ToastItem key={toast.id} {...toast} onClose={removeToast} />
            ))}
        </div>
    )
}
