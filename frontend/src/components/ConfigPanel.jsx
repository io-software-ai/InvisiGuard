import React, { useState } from 'react'
import { MAX_TEXT_BYTES, MAX_REGISTRY_TEXT_CHARS, ENGINE_CLASSIC, ENGINE_TRUSTMARK, getUtf8ByteLength } from '../utils/validation'
import { useI18n, pick } from '../i18n'
import EngineSelector, { getEngineLabel } from './EngineSelector'

const MagicWandIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="m9 15 2 2 4-4" />
    </svg>
)

// 用途情境的向量圖示（不使用 emoji，保持與品牌一致的專業風格）
const SocialIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" />
    </svg>
)
const LegalIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <line x1="3" y1="22" x2="21" y2="22" /><polygon points="12 2 21 7 3 7" />
        <line x1="6" y1="10" x2="6" y2="18" /><line x1="10" y1="10" x2="10" y2="18" /><line x1="14" y1="10" x2="14" y2="18" /><line x1="18" y1="10" x2="18" y2="18" />
    </svg>
)
const HelpIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" /><path d="M9.6 9a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .9-1 1.8" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
)

const STRINGS = {
    en: {
        purposeQuestion: 'Where will this image be used?',
        purposeSocial: 'Social sharing',
        purposeLegal: 'Copyright proof / legal evidence',
        purposeUnsure: 'Not sure',
        autoSelectedPrefix: "We've selected the",
        autoSelectedSuffix: 'engine for you (customize below)',
        watermarkTextLabel: 'Watermark Text',
        placeholder: 'e.g., Copyright 2026',
        unitChars: 'chars',
        unitBytes: 'bytes',
        trustmarkStorageHint: 'Text is stored server-side; the image only embeds a short ID.',
        embedButton: 'Embed Watermark',
        processing: 'Processing...',
    },
    zh: {
        purposeQuestion: '這張圖片主要用在哪裡？',
        purposeSocial: '社群發布',
        purposeLegal: '版權存證/法律證據',
        purposeUnsure: '不確定',
        autoSelectedPrefix: '已為你選擇',
        autoSelectedSuffix: '引擎（可於下方自訂）',
        watermarkTextLabel: '浮水印文字',
        placeholder: '例如：Copyright 2026',
        unitChars: '字元',
        unitBytes: '位元組',
        trustmarkStorageHint: '文字存於伺服器，影像只嵌入短 ID。',
        embedButton: '嵌入浮水印',
        processing: '處理中…',
    },
}

export default function ConfigPanel({ text, setText, engine, setEngine, onEmbed, loading }) {
    const { lang } = useI18n()
    const t = pick(STRINGS, lang)
    const isTrustmark = engine === ENGINE_TRUSTMARK
    const [purpose, setPurpose] = useState(null)
    const [showEngineSelector, setShowEngineSelector] = useState(false)

    // 用途快選：把技術性的引擎選擇翻譯成使用者熟悉的情境，降低選錯引擎的機率。
    // 選社群/存證會自動代入建議引擎；選「不確定」只展開下方選擇器，不預設引擎。
    const PURPOSE_OPTIONS = [
        { id: 'social', Icon: SocialIcon, label: t.purposeSocial, engine: ENGINE_TRUSTMARK },
        { id: 'legal', Icon: LegalIcon, label: t.purposeLegal, engine: ENGINE_CLASSIC },
        { id: 'unsure', Icon: HelpIcon, label: t.purposeUnsure, engine: null },
    ]

    const handlePurposeSelect = (opt) => {
        setPurpose(opt.id)
        setShowEngineSelector(true)
        if (opt.engine) {
            setEngine(opt.engine)
        }
    }

    const selectedPurpose = PURPOSE_OPTIONS.find((opt) => opt.id === purpose)

    // classic 以 UTF-8 位元組計數（後端 DM-QIM 容量限制）；
    // trustmark 文字存伺服器登錄表，改以字元數計數，上限寬鬆許多。
    const byteLength = getUtf8ByteLength(text)
    const charLength = text.length
    const count = isTrustmark ? charLength : byteLength
    const limit = isTrustmark ? MAX_REGISTRY_TEXT_CHARS : MAX_TEXT_BYTES
    const unit = isTrustmark ? t.unitChars : t.unitBytes
    const isOverLimit = count > limit

    return (
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t.purposeQuestion}
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {PURPOSE_OPTIONS.map((opt) => {
                        const isActive = purpose === opt.id
                        const Icon = opt.Icon
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                disabled={loading}
                                onClick={() => handlePurposeSelect(opt)}
                                className={`
                                    flex flex-col items-center justify-center gap-2 px-3 py-3.5 rounded-xl border text-xs font-medium transition-all duration-200 ease-spring text-center
                                    ${isActive
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/30 shadow-accent-sm scale-[1.02]'
                                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:shadow-card-hover'}
                                    ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.96]'}
                                `}
                            >
                                <Icon className="w-5 h-5" />
                                <span>{opt.label}</span>
                            </button>
                        )
                    })}
                </div>
                {selectedPurpose?.engine && (
                    <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 animate-fade-up">
                        {t.autoSelectedPrefix} <strong className="font-semibold">{getEngineLabel(selectedPurpose.engine, lang)}</strong> {t.autoSelectedSuffix}
                    </p>
                )}
            </div>

            {showEngineSelector && (
                <EngineSelector engine={engine} onChange={setEngine} disabled={loading} />
            )}

            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t.watermarkTextLabel}
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 transition-all duration-200 ease-glide focus:border-blue-500 focus:bg-white"
                        placeholder={t.placeholder}
                    />
                </div>
                <div className={`mt-2 text-right text-xs font-mono tabular-nums transition-colors duration-200 ${isOverLimit ? 'text-rose-600' : 'text-slate-400'}`}>
                    {count} / {limit} {unit}
                </div>
                {isTrustmark && (
                    <p className="mt-1 text-xs text-slate-400">
                        {t.trustmarkStorageHint}
                    </p>
                )}
            </div>

            <button
                onClick={onEmbed}
                disabled={loading || !text || isOverLimit}
                className={`
                    w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold transition-all duration-200 ease-spring
                    ${loading || !text || isOverLimit
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-blue-600 text-white shadow-accent hover:bg-blue-700 hover:-translate-y-0.5 active:scale-[0.96]'}
                `}
            >
                {loading ? (
                    <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t.processing}
                    </>
                ) : (
                    <>
                        <MagicWandIcon className="w-5 h-5" />
                        {t.embedButton}
                    </>
                )}
            </button>
        </div>
    )
}
