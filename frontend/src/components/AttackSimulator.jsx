import React, { useState, useRef, useEffect } from 'react'

export default function AttackSimulator({ imageUrl, onExport }) {
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Center pivot
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.scale(scale, scale)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset
    }

    img.src = imageUrl
    img.crossOrigin = "Anonymous"

  }, [imageUrl, rotation, scale])

  const handleExport = () => {
    if (canvasRef.current) {
      canvasRef.current.toBlob(blob => {
        const file = new File([blob], "attacked.png", { type: "image/png" })
        onExport(file)
      })
    }
  }

  return (
    <div className="animate-fade-up overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
      <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Attack Simulator</h3>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="attack-rotation" className="text-sm font-medium text-slate-700 dark:text-slate-300">Rotation</label>
              <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">{rotation}°</span>
            </div>
            <input
              id="attack-rotation"
              type="range" min="-45" max="45" value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              aria-label="Rotation"
              className="w-full cursor-pointer accent-blue-600 dark:accent-blue-500"
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="attack-scale" className="text-sm font-medium text-slate-700 dark:text-slate-300">Scale</label>
              <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">{scale}x</span>
            </div>
            <input
              id="attack-scale"
              type="range" min="0.5" max="1.5" step="0.1" value={scale}
              onChange={e => setScale(Number(e.target.value))}
              aria-label="Scale"
              className="w-full cursor-pointer accent-blue-600 dark:accent-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50">
          <canvas ref={canvasRef} className="max-w-full max-h-[400px]" />
        </div>

        <button
          onClick={handleExport}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white shadow-accent transition-all duration-200 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
          Use as Suspect Image
        </button>
      </div>
    </div>
  )
}
