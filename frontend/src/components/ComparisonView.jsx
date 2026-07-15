import React, { useEffect, useRef, useState } from 'react'
import { describePsnr, describeSsim } from '../utils/format'
import { useI18n, pick } from '../i18n'

const STRINGS = {
  en: {
    modeProcessed: 'Watermarked Result',
    modeDiff: 'Difference Map',
    modeSignal: 'Signal Map',
    original: 'Original',
    headingProcessed: 'Watermarked',
    headingDiff: 'Difference Analysis',
    headingSignal: 'HVS Signal Map',
    qualityMetrics: 'Quality Metrics',
    psnrLabel: 'PSNR (Peak Signal-to-Noise Ratio)',
    psnrHint: 'Higher is better (>30dB is good)',
    ssimLabel: 'SSIM (Structural Similarity)',
    ssimHint: 'Max 1.0 (1.0 = identical)',
  },
  zh: {
    modeProcessed: '浮水印結果',
    modeDiff: '差異圖',
    modeSignal: '訊號圖',
    original: '原始圖片',
    headingProcessed: '浮水印圖',
    headingDiff: '差異分析',
    headingSignal: '人眼視覺敏感度圖',
    qualityMetrics: '品質指標',
    psnrLabel: 'PSNR（峰值信噪比）',
    psnrHint: '數值越高越好（>30dB 即為良好）',
    ssimLabel: 'SSIM（結構相似度）',
    ssimHint: '最大值 1.0（1.0 代表完全相同）',
  },
}

export default function ComparisonView({ originalUrl, processedUrl, signalMapUrl, metrics }) {
  const { lang } = useI18n()
  const t = pick(STRINGS, lang)
  const [viewMode, setViewMode] = useState('processed')
  const canvasRef = useRef(null)

  useEffect(() => {
    if (viewMode !== 'diff' || !originalUrl || !processedUrl || !canvasRef.current) return

    const img1 = new Image()
    const img2 = new Image()
    let loaded = 0

    const drawDiff = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')

      canvas.width = img1.width
      canvas.height = img1.height

      const c1 = document.createElement('canvas')
      const c2 = document.createElement('canvas')
      c1.width = c2.width = img1.width
      c1.height = c2.height = img1.height

      const ctx1 = c1.getContext('2d')
      const ctx2 = c2.getContext('2d')

      ctx1.drawImage(img1, 0, 0)
      ctx2.drawImage(img2, 0, 0)

      const d1 = ctx1.getImageData(0, 0, img1.width, img1.height)
      const d2 = ctx2.getImageData(0, 0, img1.width, img1.height)
      const diff = ctx.createImageData(img1.width, img1.height)

      // Calculate absolute difference amplified by 10x
      for (let i = 0; i < d1.data.length; i += 4) {
        diff.data[i] = Math.abs(d1.data[i] - d2.data[i]) * 10
        diff.data[i+1] = Math.abs(d1.data[i+1] - d2.data[i+1]) * 10
        diff.data[i+2] = Math.abs(d1.data[i+2] - d2.data[i+2]) * 10
        diff.data[i+3] = 255 // Alpha
      }

      ctx.putImageData(diff, 0, 0)
    }

    img1.onload = () => { loaded++; if(loaded === 2) drawDiff() }
    img2.onload = () => { loaded++; if(loaded === 2) drawDiff() }

    img1.crossOrigin = "Anonymous"
    img2.crossOrigin = "Anonymous"

    img1.src = originalUrl
    img2.src = processedUrl

  }, [originalUrl, processedUrl, viewMode])

  const modeLabel = (mode) => mode === 'processed' ? t.modeProcessed : mode === 'diff' ? t.modeDiff : t.modeSignal

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex justify-center">
          <div role="radiogroup" className="inline-flex gap-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 p-1">
            {['processed', 'diff', 'signal'].map(mode => {
                if (mode === 'signal' && !signalMapUrl) return null
                const active = viewMode === mode
                return (
                    <button
                        key={mode}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setViewMode(mode)}
                        className={`
                            rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]
                            ${active
                                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}
                        `}
                    >
                        {modeLabel(mode)}
                    </button>
                )
            })}
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">{t.original}</h4>
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-card hover:shadow-card-hover transition-shadow duration-300 bg-slate-50 dark:bg-slate-800 aspect-auto relative group">
              <img src={originalUrl} alt="Original" className="w-full h-full object-contain" />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
            {viewMode === 'processed' ? t.headingProcessed : viewMode === 'diff' ? t.headingDiff : t.headingSignal}
          </h4>
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-card hover:shadow-card-hover transition-shadow duration-300 bg-slate-50 dark:bg-slate-800 aspect-auto relative group">
              {viewMode === 'processed' && (
                <img src={processedUrl} alt="Watermarked" className="w-full h-full object-contain" />
              )}
              {viewMode === 'diff' && (
                <canvas ref={canvasRef} className="w-full h-full object-contain bg-black/90" />
              )}
              {viewMode === 'signal' && (
                <img src={signalMapUrl} alt="Signal Map" className="w-full h-full object-contain" />
              )}
          </div>
        </div>
      </div>

      {metrics && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card p-5 sm:p-6">
          <h4 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            {t.qualityMetrics}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 border-l-2 border-l-blue-500 dark:border-l-blue-400 bg-slate-50/60 dark:bg-slate-800/30 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t.psnrLabel}</div>
                <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">{metrics.psnr} <span className="text-sm text-slate-400 dark:text-slate-500 font-normal">dB</span></div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t.psnrHint}</div>
                {describePsnr(metrics.psnr, lang) && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">{describePsnr(metrics.psnr, lang)}</div>
                )}
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 border-l-2 border-l-emerald-500 dark:border-l-emerald-400 bg-slate-50/60 dark:bg-slate-800/30 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t.ssimLabel}</div>
                <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">{metrics.ssim}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t.ssimHint}</div>
                {describeSsim(metrics.ssim, lang) && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">{describeSsim(metrics.ssim, lang)}</div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
