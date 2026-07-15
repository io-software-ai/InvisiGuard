import { useState, useEffect, useCallback } from 'react'
import api from './services/api'
import Dropzone from './components/Dropzone'
import ConfigPanel from './components/ConfigPanel'
import ComparisonView from './components/ComparisonView'
import VerifyTab from './components/VerifyTab'
import RobustnessCertificate from './components/RobustnessCertificate'
import EngineSelector from './components/EngineSelector'
import ToastContainer from './components/Toast'
import DevelopersTab from './components/DevelopersTab'
import { useTheme } from './theme'
import { useI18n, pick } from './i18n'
import { validateEmbedRequest, ENGINE_CLASSIC, ENGINE_TRUSTMARK } from './utils/validation'
import { getConfidenceTier } from './utils/format'

// 中/英雙語字典：就地定義、與元件一起維護。
const STRINGS = {
    en: {
        systemOnline: 'System Online',
        connecting: 'Connecting...',
        switchLanguageLabel: 'Switch language',
        switchToDarkTheme: 'Switch to dark theme',
        switchToLightTheme: 'Switch to light theme',
        tabs: {
            embed: 'Embed Watermark',
            extract: 'Extract (With Original)',
            verify: 'Verify (Blind)',
            developers: 'Developers',
        },
        step1Title: 'Upload Image',
        step2Title: 'Configuration',
        chooseImage: 'Choose an image',
        readyTitle: 'Ready to protect your digital assets',
        readySubtitle: 'Upload an image to get started',
        pngTitle: 'Prefer PNG When Possible',
        pngClassicPre: 'Watermark survives moderate JPEG compression in our benchmark, but ',
        pngClassicStrong: 'lossless PNG remains the safest choice',
        pngClassicPost: '.',
        pngTrustmarkPre: 'TrustMark resists moderate JPEG re-compression and resizing, making it well suited for sharing on social platforms, but we still recommend ',
        pngTrustmarkStrong: 'keeping the PNG version for the best fidelity',
        pngTrustmarkPost: '.',
        watermarkIdLabel: 'Watermark ID (use this to look up the registered text)',
        copy: 'Copy',
        copied: 'Copied',
        idSaveStrong: 'Save this ID now',
        idSaveRest: ': the full watermark text is stored in the server registry; the image only embeds this short ID.',
        resultAnalysis: 'Result Analysis',
        downloadPng: 'Download PNG',
        howItWorks: 'How it works',
        originalImage: 'Original Image',
        suspectImage: 'Suspect Image',
        optionalForTrustmark: '(optional for TrustMark)',
        uploaded: 'Uploaded',
        uploadReferenceImage: 'Upload Reference Image',
        uploadWatermarkedImage: 'Upload Watermarked Image',
        extractWatermark: 'Extract Watermark',
        processing: 'Processing...',
        extractStepTrustmark1Pre: 'Upload the ',
        extractStepTrustmark1Mid: ' (watermarked). The ',
        extractStepTrustmark1Post: ' is optional for TrustMark.',
        extractStepTrustmark2: 'TrustMark performs blind extraction: it decodes a short ID from the image and looks up the registered text.',
        extractStepClassic1Pre: 'Upload the ',
        extractStepClassic1Post: ' (reference).',
        extractStepClassic2Pre: 'Upload the ',
        extractStepClassic2Post: ' (watermarked).',
        extractStepClassic3: 'The system aligns them to extract the hidden message.',
        extractionResults: 'Extraction Results',
        decodedMessage: 'Decoded Message',
        noTextFound: '<No text found>',
        outcome: 'Outcome',
        extractSuccess: 'Extraction Successful',
        extractNotFound: 'Not Found',
        directExtraction: 'Direct extraction',
        alignedExtraction: 'Extracted after geometric alignment',
        confidenceScore: 'Confidence Score',
        waitingForImages: 'Waiting for images',
        waitingForImagesSub: 'Upload both original and suspect images to start extraction',
        footer: '© 2026 io Software. InvisiGuard: invisible watermarking & content authenticity.',
        toastValidationPrefix: 'Please fix the following and try again:',
        toastTryAgain: 'Please try again.',
        toastEmbedGenericError: 'Something went wrong while embedding the watermark. Please check your connection and try again; if this keeps happening, check the console for details.',
        toastEngineUnavailable: 'This server does not have the deep-learning engine (TrustMark) enabled.',
        toastEngineUnavailableSuggestion: 'Please switch to the Classic engine.',
        toastExtractGenericError: 'Extraction failed. Please confirm you uploaded the correct original and suspect images and selected the right engine, then try again.',
        toastDownloadError: 'Download failed. Please check your connection and try again; you can also right-click the image and save it manually.',
    },
    zh: {
        systemOnline: '系統已連線',
        connecting: '連線中...',
        switchLanguageLabel: '切換語言',
        switchToDarkTheme: '切換為深色主題',
        switchToLightTheme: '切換為淺色主題',
        tabs: {
            embed: '嵌入浮水印',
            extract: '提取（附原圖）',
            verify: '驗證（盲驗證）',
            developers: '開發者',
        },
        step1Title: '上傳圖片',
        step2Title: '設定',
        chooseImage: '選擇圖片',
        readyTitle: '準備好保護您的數位資產',
        readySubtitle: '上傳圖片以開始',
        pngTitle: '請盡量使用 PNG 格式',
        pngClassicPre: '本浮水印在我們的實測中能承受中度 JPEG 壓縮，但',
        pngClassicStrong: '無損 PNG 格式仍是最安全的選擇',
        pngClassicPost: '。',
        pngTrustmarkPre: 'TrustMark 可抵抗中度 JPEG 重壓縮與縮放，適合在社群平台流通，但仍建議',
        pngTrustmarkStrong: '保留 PNG 版本以獲得最佳保真度',
        pngTrustmarkPost: '。',
        watermarkIdLabel: 'Watermark ID（憑此反查登錄文字）',
        copy: '複製',
        copied: '已複製',
        idSaveStrong: '請立即保存此 ID',
        idSaveRest: '：完整浮水印文字存於伺服器登錄表，影像僅嵌入此短 ID。',
        resultAnalysis: '結果分析',
        downloadPng: '下載 PNG',
        howItWorks: '運作方式',
        originalImage: '原始圖片',
        suspectImage: '可疑圖片',
        optionalForTrustmark: '（TrustMark 可選填）',
        uploaded: '已上傳',
        uploadReferenceImage: '上傳參考圖片',
        uploadWatermarkedImage: '上傳含浮水印圖片',
        extractWatermark: '提取浮水印',
        processing: '處理中...',
        extractStepTrustmark1Pre: '上傳',
        extractStepTrustmark1Mid: '（已加浮水印）。',
        extractStepTrustmark1Post: '對 TrustMark 為選填。',
        extractStepTrustmark2: 'TrustMark 執行盲提取：直接從圖片解碼出短 ID，並查詢登錄的文字。',
        extractStepClassic1Pre: '上傳',
        extractStepClassic1Post: '（參考用）。',
        extractStepClassic2Pre: '上傳',
        extractStepClassic2Post: '（已加浮水印）。',
        extractStepClassic3: '系統會將兩者對齊以取出隱藏訊息。',
        extractionResults: '提取結果',
        decodedMessage: '解碼訊息',
        noTextFound: '<未找到文字>',
        outcome: '判定結果',
        extractSuccess: '提取成功',
        extractNotFound: '未找到',
        directExtraction: '直接提取',
        alignedExtraction: '幾何對齊後提取',
        confidenceScore: '信心分數',
        waitingForImages: '等待圖片上傳',
        waitingForImagesSub: '請上傳原圖與可疑圖片以開始提取',
        footer: '© 2026 io Software。InvisiGuard：隱形浮水印與內容真實性。',
        toastValidationPrefix: '輸入有誤，請修正後再試：',
        toastTryAgain: '請再試一次。',
        toastEmbedGenericError: '嵌入浮水印時發生錯誤，請檢查網路連線後再試一次；若持續發生請查看主控台訊息。',
        toastEngineUnavailable: '此伺服器未啟用深度學習引擎（TrustMark）。',
        toastEngineUnavailableSuggestion: '請改用 Classic 引擎。',
        toastExtractGenericError: '提取失敗，請確認已上傳正確的原圖與可疑圖片，並確認引擎選擇正確後再試一次。',
        toastDownloadError: '下載失敗，請確認網路連線後再試一次；若持續發生，可改用瀏覽器右鍵另存圖片。',
    },
}

// Icons
const ShieldCheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
    </svg>
)

const LockIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
)

const SearchIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
    </svg>
)

const DownloadIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
)

const TerminalIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
)

const CopyIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
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

const SunIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
)

const MoonIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
)

// 有效分頁（Extract 已移除）。狀態與網址 hash 同步，讓外部可深連結到特定分頁。
const VALID_TABS = ['embed', 'verify', 'developers']

function App() {
    const { theme, toggle: toggleTheme } = useTheme()
    const { lang, toggle: toggleLang } = useI18n()
    const t = pick(STRINGS, lang)

    const [health, setHealth] = useState(null)
    // 初始分頁讀自網址 hash（#embed / #verify / #developers），例如頁尾「技術文件」深連結。
    const [activeTab, setActiveTab] = useState(() => {
        const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
        return VALID_TABS.includes(h) ? h : 'embed'
    })
    const selectTab = (id) => {
        setActiveTab(id)
        if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${id}`)
    }

    // Toast 通知：取代全站阻斷式 alert()，可疊加、可手動關閉、數秒後自動消失。
    const [toasts, setToasts] = useState([])
    const addToast = useCallback((message, type = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        setToasts((prev) => [...prev, { id, message, type }])
    }, [])
    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    // 單一共享引擎狀態：Embed / Verify 分頁共用同一個 engine，
    // 避免使用者在不同分頁各自選了不同引擎卻不自知（切換分頁時引擎選擇會保持一致）。
    const [engine, setEngine] = useState(ENGINE_CLASSIC)

    // Embed State
    const [file, setFile] = useState(null)
    const [text, setText] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [originalPreview, setOriginalPreview] = useState(null)
    const [idCopied, setIdCopied] = useState(false)

    const handleCopyId = async () => {
        if (!result?.watermark_id) return
        try {
            await navigator.clipboard.writeText(result.watermark_id)
            setIdCopied(true)
            setTimeout(() => setIdCopied(false), 2000)
        } catch {
            /* clipboard 不可用時靜默忽略 */
        }
    }

    useEffect(() => {
        api.get('/health')
            .then(res => setHealth(res.data))
            .catch(err => console.error(err))
    }, [])

    // 同步瀏覽器前進/後退與外部改動 hash 時的分頁狀態。
    useEffect(() => {
        const onHashChange = () => {
            const h = window.location.hash.replace('#', '')
            if (VALID_TABS.includes(h)) setActiveTab(h)
        }
        window.addEventListener('hashchange', onHashChange)
        return () => window.removeEventListener('hashchange', onHashChange)
    }, [])

    const handleEmbedFileSelect = (selectedFile) => {
        setFile(selectedFile)
        setOriginalPreview(URL.createObjectURL(selectedFile))
        setResult(null)
    }

    const handleEmbed = async () => {
        const validation = validateEmbedRequest(file, text, engine)
        if (!validation.valid) {
            const errorMessage = validation.errors.join('\n')
            addToast(`${t.toastValidationPrefix}\n${errorMessage}`, 'error')
            return
        }

        setLoading(true)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('text', text.trim())
        formData.append('engine', engine)
        formData.append('certify', 'true')  // 要求伺服器回傳實測穩健性證書

        try {
            const res = await api.post('/embed', formData)
            setResult(res.data.data)
        } catch (err) {
            console.error(err)
            if (err.response?.data?.message) {
                const errorData = err.response.data
                addToast(`${errorData.message}\n${errorData.suggestion || t.toastTryAgain}`, 'error')
            } else {
                addToast(t.toastEmbedGenericError, 'error')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleDownloadResult = async () => {
        if (!result || !result.image_url) return

        setLoading(true)
        try {
            const resp = await fetch(result.image_url)
            if (!resp.ok) throw new Error('Download failed')
            const blob = await resp.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'watermarked_image.png'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error(err)
            addToast(t.toastDownloadError, 'error')
        } finally {
            setLoading(false)
        }
    }

    const tabs = [
        { id: 'embed', label: t.tabs.embed, icon: LockIcon },
        { id: 'verify', label: t.tabs.verify, icon: SearchIcon },
        { id: 'developers', label: t.tabs.developers, icon: TerminalIcon },
    ]

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
            {/* Header */}
            <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-2 rounded-xl text-white shadow-accent-sm">
                            <ShieldCheckIcon className="w-6 h-6" />
                        </div>
                        <span className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                            InvisiGuard
                        </span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-2 mr-1">
                            <div className={`w-2 h-2 rounded-full ${health ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-red-500 animate-pulse'}`}></div>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 hidden sm:block">
                                {health ? t.systemOnline : t.connecting}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={toggleLang}
                            aria-label={t.switchLanguageLabel}
                            className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                        >
                            {lang === 'zh' ? 'EN' : '中文'}
                        </button>

                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={theme === 'dark' ? t.switchToLightTheme : t.switchToDarkTheme}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent p-2 text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                        >
                            {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">

                {/* Tabs */}
                <div className="flex justify-center mb-10 px-4">
                    <div className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-card border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:flex gap-1 w-full sm:w-auto">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => selectTab(tab.id)}
                                    className={`
                                        flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap w-full sm:w-auto
                                        ${isActive
                                            ? 'bg-blue-600 text-white shadow-accent-sm scale-[1.02]'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'}
                                    `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {activeTab === 'embed' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* Left Column: Controls */}
                            <div className="lg:col-span-4 space-y-6">
                                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden hover:shadow-card-hover transition-shadow duration-300">
                                    <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                                        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                            <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold tabular-nums">1</span>
                                            {t.step1Title}
                                        </h2>
                                    </div>
                                    <div className="p-6">
                                        <Dropzone onFileSelect={handleEmbedFileSelect} label={file ? file.name : t.chooseImage} />
                                    </div>
                                </div>

                                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden hover:shadow-card-hover transition-shadow duration-300">
                                    <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                                        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                            <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold tabular-nums">2</span>
                                            {t.step2Title}
                                        </h2>
                                    </div>
                                    <div className="p-6">
                                        <ConfigPanel
                                            text={text}
                                            setText={setText}
                                            engine={engine}
                                            setEngine={setEngine}
                                            onEmbed={handleEmbed}
                                            loading={loading}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Preview & Results */}
                            <div className="lg:col-span-8 space-y-6">
                                {(!result && !originalPreview) && (
                                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-100/50 dark:bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500">
                                        <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-card mb-4">
                                            <ShieldCheckIcon className="w-10 h-10 text-blue-300 dark:text-blue-800/60" />
                                        </div>
                                        <p className="font-medium tracking-tight">{t.readyTitle}</p>
                                        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{t.readySubtitle}</p>
                                    </div>
                                )}

                                {originalPreview && !result && (
                                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden p-2">
                                        <img src={originalPreview} alt="Preview" className="w-full h-full object-contain rounded-xl bg-slate-50 dark:bg-slate-800" />
                                    </div>
                                )}

                                {result && (
                                    <div className="space-y-6 animate-in fade-in duration-500">
                                        {/* PNG Format Warning */}
                                        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50 p-4 flex gap-3">
                                            <div className="shrink-0 mt-0.5">
                                                <svg className="h-5 w-5 text-amber-500 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t.pngTitle}</h3>
                                                <div className="mt-1 text-sm text-amber-700/80 dark:text-amber-400/80">
                                                    {result.engine === ENGINE_TRUSTMARK ? (
                                                        <>
                                                            {t.pngTrustmarkPre}<strong className="font-semibold text-amber-900 dark:text-amber-200">{t.pngTrustmarkStrong}</strong>{t.pngTrustmarkPost}
                                                        </>
                                                    ) : (
                                                        <>
                                                            {t.pngClassicPre}<strong className="font-semibold text-amber-900 dark:text-amber-200">{t.pngClassicStrong}</strong>{t.pngClassicPost}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {result.engine === ENGINE_TRUSTMARK && result.watermark_id && (
                                            <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/50 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <h3 className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-1">
                                                            {t.watermarkIdLabel}
                                                        </h3>
                                                        <div className="font-mono tabular-nums text-lg font-bold text-blue-900 dark:text-blue-100 break-all">
                                                            {result.watermark_id}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={handleCopyId}
                                                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                                                    >
                                                        {idCopied ? (
                                                            <>
                                                                <CheckIcon className="w-3.5 h-3.5" /> {t.copied}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CopyIcon className="w-3.5 h-3.5" /> {t.copy}
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                                <p className="mt-2 text-xs text-blue-700/70 dark:text-blue-400/70">
                                                    <strong>{t.idSaveStrong}</strong>{t.idSaveRest}
                                                </p>
                                            </div>
                                        )}

                                        {result.robustness && (
                                            <RobustnessCertificate robustness={result.robustness} />
                                        )}

                                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
                                            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex justify-between items-center">
                                                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t.resultAnalysis}</h2>
                                                <button
                                                    onClick={handleDownloadResult}
                                                    disabled={loading}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                                                >
                                                    <DownloadIcon className="w-4 h-4" />
                                                    {t.downloadPng}
                                                </button>
                                            </div>
                                            <div className="p-6">
                                                <ComparisonView
                                                    originalUrl={originalPreview}
                                                    processedUrl={result.image_url}
                                                    signalMapUrl={result.signal_map_url ? result.signal_map_url : null}
                                                    metrics={{ psnr: result.psnr, ssim: result.ssim }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'verify' && (
                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
                             <VerifyTab engine={engine} onEngineChange={setEngine} addToast={addToast} />
                        </div>
                    )}

                    {activeTab === 'developers' && (
                        <DevelopersTab />
                    )}
                </div>
            </main>

            <footer className="mt-12 py-8 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 dark:text-slate-500 text-sm">
                    {t.footer}
                </div>
            </footer>

            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </div>
    )
}

export default App
