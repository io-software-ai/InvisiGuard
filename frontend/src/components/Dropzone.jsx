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
    invalidFormat: 'Unsupported file format. Please choose a PNG or JPEG image.',
  },
  zh: {
    subtitle: '拖曳圖片到此處，或點擊選擇檔案',
    invalidFormat: '不支援的檔案格式，請改用 PNG 或 JPEG 圖片。',
  },
}

// 與 utils/validation.js 的 ALLOWED_IMAGE_TYPES 一致：後端僅支援 PNG / JPEG。
// 拖放完全繞過 input 的 accept 屬性，所以必須在這裡就地攔截（HEIC 等直接擋下）。
// 部分環境（如 Windows 上的某些檔案）MIME type 為空字串，此時退而檢查副檔名。
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
const ALLOWED_EXT = /\.(png|jpe?g)$/i
const isAllowedFile = (file) =>
    ALLOWED_TYPES.includes(file.type) || (!file.type && ALLOWED_EXT.test(file.name))

export default function Dropzone({ onFileSelect, label = "Upload Image" }) {
  const { lang } = useI18n()
  const t = pick(STRINGS, lang)
  const fileInputRef = useRef(null)
  const [isDragActive, setIsDragActive] = useState(false)
  // rejectedName：被擋下的檔名（null = 無錯誤）；shaking 觸發一次 Error Shake。
  const [rejectedName, setRejectedName] = useState(null)
  const [shaking, setShaking] = useState(false)

  // 單一入口：點選與拖放都經過這裡；不合格式的檔案不會傳給 onFileSelect。
  const handleFile = useCallback((file) => {
    if (!file) return
    if (isAllowedFile(file)) {
      setRejectedName(null)
      onFileSelect(file)
    } else {
      setRejectedName(file.name)
      setShaking(true)
    }
  }, [onFileSelect])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }, [handleFile])

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
      handleFile(e.target.files[0])
    }
    // 清空 input，讓使用者換檔重選（即使同名檔案）也會再次觸發 onChange。
    e.target.value = ''
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

  const hasError = rejectedName !== null && !isDragActive

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onAnimationEnd={() => setShaking(false)}
      className={`
        relative group cursor-pointer transition-all duration-300 ease-spring
        border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center
        bg-white active:scale-[0.98]
        focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus:outline-none
        ${shaking ? 'animate-shake' : ''}
        ${isDragActive
            ? 'border-blue-500 bg-blue-50 shadow-accent scale-[1.01]'
            : hasError
                ? 'border-rose-400 bg-rose-50/40 shadow-card'
                : 'border-slate-300 shadow-card hover:border-blue-400 hover:bg-slate-50 hover:shadow-card-hover'}
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
        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
        onChange={handleChange}
      />

      <div className={`
        p-4 rounded-full mb-3 transition-[transform,background-color,color] duration-300 ease-spring
        ${isDragActive
            ? 'bg-blue-100 text-blue-600 scale-110'
            : hasError
                ? 'bg-rose-100 text-rose-500'
                : 'bg-slate-100 text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 group-hover:scale-110'}
      `}>
        <UploadIcon className="w-8 h-8" />
      </div>

      <p className={`font-semibold tracking-tight transition-colors duration-300 ${isDragActive ? 'text-blue-700' : hasError ? 'text-rose-700' : 'text-slate-900'}`}>
        {label}
      </p>
      {hasError ? (
        <div role="alert" className="mt-1 space-y-0.5">
          <p className="text-sm font-medium text-rose-600">{t.invalidFormat}</p>
          <p className="font-mono text-xs text-rose-400 break-all">{rejectedName}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-400 mt-1">
          {t.subtitle}
        </p>
      )}
    </div>
  )
}
