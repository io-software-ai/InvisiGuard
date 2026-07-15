import React, { useCallback, useRef, useState } from 'react'
import { useI18n, pick } from '../i18n'

const UploadIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
)

const STRINGS = {
  en: {
    subtitle: 'Drag & drop or click to select',
  },
  zh: {
    subtitle: '拖曳圖片到此處，或點擊選擇檔案',
  },
}

export default function Dropzone({ onFileSelect, label = "Upload Image" }) {
  const { lang } = useI18n()
  const t = pick(STRINGS, lang)
  const fileInputRef = useRef(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0])
    }
  }, [onFileSelect])

  const handleDragOver = (e) => {
      e.preventDefault()
      setIsDragActive(true)
  }

  const handleDragLeave = (e) => {
      e.preventDefault()
      setIsDragActive(false)
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0])
    }
  }

  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className={`
        relative group cursor-pointer transition-all duration-300 ease-in-out
        border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center
        bg-white dark:bg-slate-900 active:scale-[0.99]
        focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus:outline-none
        ${isDragActive
            ? 'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-accent scale-[1.02]'
            : 'border-slate-300 dark:border-slate-600 shadow-card hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:shadow-card-hover'}
      `}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleChange}
      />

      <div className={`
        p-4 rounded-full mb-3 transition-all duration-300
        ${isDragActive
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 scale-105'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 group-hover:scale-105'}
      `}>
        <UploadIcon className="w-8 h-8" />
      </div>

      <p className={`font-semibold tracking-tight transition-colors duration-300 ${isDragActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-100'}`}>
        {label}
      </p>
      <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
        {t.subtitle}
      </p>
    </div>
  )
}
