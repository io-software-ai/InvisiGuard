import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import api from './services/api'
import Dropzone from './components/Dropzone'
import ConfigPanel from './components/ConfigPanel'
import ComparisonView from './components/ComparisonView'
import VerifyTab from './components/VerifyTab'
import RobustnessCertificate from './components/RobustnessCertificate'
import EngineSelector from './components/EngineSelector'
import ToastContainer from './components/Toast'
import DevelopersTab from './components/DevelopersTab'
import StatusTab from './components/StatusTab'
import { useI18n, pick } from './i18n'
import { validateEmbedRequest, ENGINE_CLASSIC, ENGINE_TRUSTMARK } from './utils/validation'
import { getConfidenceTier } from './utils/format'

// 中/英雙語字典：就地定義、與元件一起維護。
const STRINGS = {
    en: {
        systemOnline: 'System Online',
        connecting: 'Connecting...',
        switchLanguageLabel: 'Switch language',
        tabs: {
            embed: 'Embed Watermark',
            extract: 'Extract (With Original)',
            verify: 'Verify (Blind)',
            developers: 'Developers',
            status: 'Status',
        },
        openMenu: 'Open menu',
        closeMenu: 'Close menu',
        views: {
            embed: { title: 'Embed a watermark', desc: 'Upload an image, pick an engine, and get an invisible mark with a measured robustness report.' },
            verify: { title: 'Verify an image', desc: 'Blind check: detect an invisible watermark straight from a single image, no original needed.' },
            developers: { title: 'Developer API & CLI', desc: 'Integrate watermarking into your pipeline with curl, Python, or JavaScript.' },
            status: { title: 'System status', desc: 'Live availability of the watermarking service, checked from your browser.' },
        },
        statusChipLabel: 'View system status',
        footerSlogan: 'Unseen protection, proven detection.',
        footerDesc: 'InvisiGuard embeds tamper-resistant, invisible watermarks with dual engines and issues a measured robustness report for every mark. Built by io Software for creators, platforms, and teams that need provable content authenticity.',
        footerKicker: 'Measured, not claimed.',
        footerPlatform: 'Platform',
        footerCompany: 'Company',
        footerAbout: 'About io Software',
        footerContact: 'Contact',
        footerRights: 'All rights reserved.',
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
        tabs: {
            embed: '嵌入浮水印',
            extract: '提取（附原圖）',
            verify: '驗證（盲驗證）',
            developers: '開發者',
            status: '系統狀態',
        },
        openMenu: '開啟選單',
        closeMenu: '關閉選單',
        views: {
            embed: { title: '嵌入浮水印', desc: '上傳圖片、選擇引擎，取得附實測穩健度報告的隱形浮水印。' },
            verify: { title: '驗證圖片', desc: '盲驗證：不需原圖，單張圖片直接偵測隱形浮水印。' },
            developers: { title: '開發者 API 與 CLI', desc: '用 curl、Python 或 JavaScript 把浮水印整合進你的自動化流程。' },
            status: { title: '系統狀態', desc: '由你的瀏覽器即時檢查浮水印服務的可用性。' },
        },
        statusChipLabel: '查看系統狀態',
        footerSlogan: 'Unseen protection, proven detection.',
        footerDesc: 'InvisiGuard 以雙引擎嵌入抗竄改的隱形浮水印，並為每一次嵌入出具實測穩健度報告。由 io Software 打造，給需要可驗證內容真實性的創作者、平台與團隊。',
        footerKicker: 'Measured, not claimed.',
        footerPlatform: '平台',
        footerCompany: '公司',
        footerAbout: '關於 io Software',
        footerContact: '聯絡我們',
        footerRights: 'All rights reserved.',
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

const ActivityIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
)

const MenuIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <line x1="4" x2="20" y1="7" y2="7" />
        <line x1="4" x2="20" y1="12" y2="12" />
        <line x1="4" x2="20" y1="17" y2="17" />
    </svg>
)

// 有效分頁（Extract 已移除）。狀態與網址 hash 同步，讓外部可深連結到特定分頁。
const VALID_TABS = ['embed', 'verify', 'developers', 'status']

function App() {
    const { lang, toggle: toggleLang } = useI18n()
    const t = pick(STRINGS, lang)

    const [health, setHealth] = useState(null)
    // 初始分頁讀自網址 hash（#embed / #verify / #developers），例如頁尾「技術文件」深連結。
    const [activeTab, setActiveTab] = useState(() => {
        const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
        return VALID_TABS.includes(h) ? h : 'embed'
    })
    // 手機漢堡選單開合（純呈現狀態）。
    const [menuOpen, setMenuOpen] = useState(false)

    // pushState（而非 replaceState）讓瀏覽器返回鍵能在子頁之間正常回退；
    // 返回/前進造成的 hash 變化由下方 hashchange 監聽同步回分頁狀態。
    const selectTab = (id) => {
        setActiveTab(id)
        setMenuOpen(false)
        if (typeof window !== 'undefined' && window.location.hash !== `#${id}`) {
            window.history.pushState(null, '', `#${id}`)
            window.scrollTo(0, 0)
        }
    }

    // Esc 關閉漢堡選單。
    useEffect(() => {
        if (!menuOpen) return
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [menuOpen])

    // Kinetics R1 TAB PILL GLIDE（純呈現狀態）：量測 active 分頁按鈕的位置與尺寸，
    // 讓一顆絕對定位的藍色 pill 以 glide 緩動滑到它背後。不影響任何資料流。
    const tabRefs = useRef({})
    const [pill, setPill] = useState(null)
    const measurePill = useCallback(() => {
        const el = tabRefs.current[activeTab]
        if (!el) return
        setPill({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })
    }, [activeTab])
    // useLayoutEffect：首次繪製前就定位，避免 pill 從 (0,0) 飛入。lang 改變會改字寬，需重量測。
    useLayoutEffect(() => { measurePill() }, [measurePill, lang])
    useEffect(() => {
        let cancelled = false
        window.addEventListener('resize', measurePill)
        // 字型載入完成後字寬可能改變，再量一次。
        if (document.fonts?.ready) document.fonts.ready.then(() => { if (!cancelled) measurePill() })
        return () => {
            cancelled = true
            window.removeEventListener('resize', measurePill)
        }
    }, [measurePill])

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

    // Kinetics R4 STAGGER ENTRANCE（純呈現狀態）：result 出現後於掛載下一影格加上 .in，
    // 讓結果欄各卡片依 transition-delay 依序浮現。雙層 rAF 確保初始樣式已繪製。
    const [resultsIn, setResultsIn] = useState(false)
    useEffect(() => {
        if (!result) {
            setResultsIn(false)
            return
        }
        let id2
        const id1 = requestAnimationFrame(() => {
            id2 = requestAnimationFrame(() => setResultsIn(true))
        })
        return () => {
            cancelAnimationFrame(id1)
            if (id2) cancelAnimationFrame(id2)
        }
    }, [result])
    const staggerCls = `stagger-item${resultsIn ? ' in' : ''}`

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

    // SEO：每個子頁有自己的 document.title 與 meta description（隨語言切換）。
    useEffect(() => {
        const v = t.views[activeTab]
        if (!v) return
        document.title = `${v.title} | InvisiGuard`
        document.querySelector('meta[name="description"]')?.setAttribute('content', v.desc)
    }, [activeTab, t])

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
        { id: 'status', label: t.tabs.status, icon: ActivityIcon },
    ]

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-2 rounded-xl text-white shadow-accent-sm">
                            <ShieldCheckIcon className="w-6 h-6" />
                        </div>
                        <span className="text-xl font-semibold tracking-tight text-slate-900">
                            InvisiGuard
                        </span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* 狀態晶片可點擊，直達系統狀態子頁（子頁互聯） */}
                        <button
                            type="button"
                            onClick={() => selectTab('status')}
                            aria-label={t.statusChipLabel}
                            title={t.statusChipLabel}
                            className="flex items-center gap-2 mr-1 rounded-full px-2.5 py-1.5 transition-[background-color,transform] duration-200 ease-spring hover:bg-slate-100 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                        >
                            <span className={`w-2 h-2 rounded-full ${health ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-red-500 animate-pulse'}`}></span>
                            <span className="text-sm font-medium text-slate-600 hidden sm:block">
                                {health ? t.systemOnline : t.connecting}
                            </span>
                        </button>

                        {/* 現代分段式語言切換：兩個語言並列，活動項以白底藥丸高亮 */}
                        <div
                            role="group"
                            aria-label={t.switchLanguageLabel}
                            className="flex items-center rounded-full border border-slate-200 bg-slate-100/70 p-0.5"
                        >
                            <button
                                type="button"
                                onClick={() => { if (lang !== 'zh') toggleLang() }}
                                aria-pressed={lang === 'zh'}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-[color,background-color,transform] duration-200 ease-spring active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none ${lang === 'zh' ? 'bg-white text-slate-900 shadow-card' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                中文
                            </button>
                            <button
                                type="button"
                                onClick={() => { if (lang !== 'en') toggleLang() }}
                                aria-pressed={lang === 'en'}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-[color,background-color,transform] duration-200 ease-spring active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none ${lang === 'en' ? 'bg-white text-slate-900 shadow-card' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                EN
                            </button>
                        </div>

                        {/* 手機漢堡鈕：開合子頁選單 */}
                        <button
                            type="button"
                            onClick={() => setMenuOpen((v) => !v)}
                            aria-expanded={menuOpen}
                            aria-label={menuOpen ? t.closeMenu : t.openMenu}
                            className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-[background-color,transform] duration-200 ease-spring hover:bg-slate-50 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                        >
                            {menuOpen ? <CrossIcon className="w-4 h-4" /> : <MenuIcon className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* 手機下拉選單：子頁清單（活動項藍色高亮），點選即關閉 */}
                {menuOpen && (
                    <nav className="sm:hidden absolute left-0 right-0 top-16 border-b border-slate-200 bg-white shadow-card-hover origin-top-right animate-menu-in">
                        <ul className="px-3 py-2">
                            {tabs.map((tab) => {
                                const Icon = tab.icon
                                const isActive = activeTab === tab.id
                                return (
                                    <li key={tab.id}>
                                        <button
                                            type="button"
                                            onClick={() => selectTab(tab.id)}
                                            aria-current={isActive ? 'page' : undefined}
                                            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition-[background-color,color,transform] duration-200 ease-spring active:scale-[0.98] ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <Icon className="w-5 h-5" />
                                            {tab.label}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </nav>
                )}
            </header>

            {/* 漢堡選單背景遮罩：點擊關閉 */}
            {menuOpen && (
                <div
                    aria-hidden="true"
                    onClick={() => setMenuOpen(false)}
                    className="sm:hidden fixed inset-0 top-16 z-40 bg-slate-900/20"
                />
            )}

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">

                {/* Tabs: R1 pill 滑塊在 active 按鈕背後以 glide 緩動滑動 */}
                {/* 分頁列僅桌機顯示；手機導覽走 header 漢堡選單。 */}
                <div className="hidden sm:flex justify-center mb-10 px-4">
                    <div className="relative bg-white p-1.5 rounded-2xl shadow-card border border-slate-200 flex gap-1">
                        <div
                            aria-hidden="true"
                            className="absolute rounded-xl bg-blue-600 shadow-accent-sm pointer-events-none transition-[left,top,width,height] duration-[400ms] ease-glide"
                            style={pill
                                ? { left: pill.left, top: pill.top, width: pill.width, height: pill.height }
                                : { opacity: 0 }}
                        />
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    ref={(el) => { tabRefs.current[tab.id] = el }}
                                    onClick={() => selectTab(tab.id)}
                                    className={`
                                        relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-[color,background-color,transform] duration-200 ease-spring active:scale-[0.96]
                                        ${isActive
                                            ? 'text-white'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                                    `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div key={activeTab} className="animate-fade-up">
                    {/* 每個子頁一個 h1 + 一句說明：視覺層級與 SEO 兼顧 */}
                    <div className="mb-8">
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                            {t.views[activeTab].title}
                        </h1>
                        <p className="mt-1.5 text-sm sm:text-base text-slate-500 max-w-[65ch]">
                            {t.views[activeTab].desc}
                        </p>
                    </div>

                    {activeTab === 'embed' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* Left Column: Controls */}
                            <div className="lg:col-span-4 space-y-6">
                                <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden">
                                    <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/60">
                                        <h2 className="text-lg font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                                            <span className="bg-blue-50 text-blue-600 border border-blue-100 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold tabular-nums">1</span>
                                            {t.step1Title}
                                        </h2>
                                    </div>
                                    <div className="p-6">
                                        <Dropzone onFileSelect={handleEmbedFileSelect} label={file ? file.name : t.chooseImage} />
                                    </div>
                                </div>

                                <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden">
                                    <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/60">
                                        <h2 className="text-lg font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                                            <span className="bg-blue-50 text-blue-600 border border-blue-100 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold tabular-nums">2</span>
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
                                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-100/50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                                        <div className="p-4 bg-white rounded-full shadow-card mb-4">
                                            <ShieldCheckIcon className="w-10 h-10 text-blue-300" />
                                        </div>
                                        <p className="font-medium tracking-tight">{t.readyTitle}</p>
                                        <p className="text-sm text-slate-400 mt-1">{t.readySubtitle}</p>
                                    </div>
                                )}

                                {originalPreview && !result && (
                                    <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden p-2">
                                        <img src={originalPreview} alt="Preview" className="w-full h-full object-contain rounded-xl bg-slate-50" />
                                    </div>
                                )}

                                {result && (
                                    <div className="space-y-6">
                                        {/* PNG Format Warning: R4 stagger 第 1 格 */}
                                        <div className={`${staggerCls} bg-amber-50 rounded-xl border border-amber-200 p-4 flex gap-3`} style={{ transitionDelay: '0ms' }}>
                                            <div className="shrink-0 mt-0.5">
                                                <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-amber-800">{t.pngTitle}</h3>
                                                <div className="mt-1 text-sm text-amber-700/80">
                                                    {result.engine === ENGINE_TRUSTMARK ? (
                                                        <>
                                                            {t.pngTrustmarkPre}<strong className="font-semibold text-amber-900">{t.pngTrustmarkStrong}</strong>{t.pngTrustmarkPost}
                                                        </>
                                                    ) : (
                                                        <>
                                                            {t.pngClassicPre}<strong className="font-semibold text-amber-900">{t.pngClassicStrong}</strong>{t.pngClassicPost}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {result.engine === ENGINE_TRUSTMARK && result.watermark_id && (
                                            <div className={`${staggerCls} bg-blue-50 rounded-xl border border-blue-100 p-4`} style={{ transitionDelay: '60ms' }}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <h3 className="text-xs font-semibold text-blue-700 tracking-wider mb-1">
                                                            {t.watermarkIdLabel}
                                                        </h3>
                                                        <div className="font-mono tabular-nums text-lg font-bold text-blue-900 break-all">
                                                            {result.watermark_id}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={handleCopyId}
                                                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-semibold transition-[background-color,transform] duration-200 ease-spring hover:bg-blue-50 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                                                    >
                                                        {idCopied ? (
                                                            <>
                                                                {/* R6 SUCCESS CHECK：打勾以 spring 彈入 */}
                                                                <CheckIcon className="w-3.5 h-3.5 animate-pop-in" /> {t.copied}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CopyIcon className="w-3.5 h-3.5" /> {t.copy}
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                                <p className="mt-2 text-xs text-blue-700/70">
                                                    <strong>{t.idSaveStrong}</strong>{t.idSaveRest}
                                                </p>
                                            </div>
                                        )}

                                        {result.robustness && (
                                            <div className={staggerCls} style={{ transitionDelay: '120ms' }}>
                                                <RobustnessCertificate robustness={result.robustness} />
                                            </div>
                                        )}

                                        <div className={`${staggerCls} rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden`} style={{ transitionDelay: '180ms' }}>
                                            <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
                                                <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t.resultAnalysis}</h2>
                                                <button
                                                    onClick={handleDownloadResult}
                                                    disabled={loading}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] duration-200 ease-spring hover:bg-slate-800 hover:-translate-y-0.5 active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none"
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
                        <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden">
                             <VerifyTab engine={engine} onEngineChange={setEngine} addToast={addToast} />
                        </div>
                    )}

                    {activeTab === 'developers' && (
                        <DevelopersTab />
                    )}

                    {activeTab === 'status' && (
                        <StatusTab />
                    )}
                </div>
            </main>

            {/* 結構化頁尾：品牌區 + 平台子頁互聯 + 公司連結。錨點連結會觸發 hashchange 同步分頁。 */}
            <footer className="mt-12 bg-white border-t border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-2 max-w-sm">
                            <div className="flex items-center gap-2.5">
                                <div className="bg-blue-600 p-2 rounded-xl text-white shadow-accent-sm">
                                    <ShieldCheckIcon className="w-6 h-6" />
                                </div>
                                <span className="text-xl font-semibold tracking-tight text-slate-900">InvisiGuard</span>
                            </div>
                            <p className="mt-3.5 text-base font-medium tracking-tight text-slate-700">
                                {t.footerSlogan}
                            </p>
                            <p className="mt-2 text-[15px] sm:text-sm text-slate-500 leading-relaxed">
                                {t.footerDesc}
                            </p>
                            <p className="mt-3 font-mono text-xs tracking-[0.14em] text-slate-400">
                                {t.footerKicker}
                            </p>
                        </div>

                        <nav aria-label={t.footerPlatform}>
                            <h3 className="text-sm font-semibold tracking-wide text-slate-400">{t.footerPlatform}</h3>
                            <ul className="mt-3.5 space-y-3 sm:space-y-2.5">
                                {tabs.map((tab) => (
                                    <li key={tab.id}>
                                        <a
                                            href={`#${tab.id}`}
                                            className="inline-block py-0.5 text-base text-slate-600 hover:text-slate-900 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none rounded"
                                        >
                                            {tab.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <nav aria-label={t.footerCompany}>
                            <h3 className="text-sm font-semibold tracking-wide text-slate-400">{t.footerCompany}</h3>
                            <ul className="mt-3.5 space-y-3 sm:space-y-2.5">
                                <li>
                                    <a
                                        href="https://iosoftware.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block py-0.5 text-base text-slate-600 hover:text-slate-900 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none rounded"
                                    >
                                        {t.footerAbout}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="mailto:contact@iosoftware.ai"
                                        className="inline-block py-0.5 text-base text-slate-600 hover:text-slate-900 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none rounded"
                                    >
                                        {t.footerContact}
                                    </a>
                                </li>
                            </ul>
                        </nav>
                    </div>

                    {/* 公司識別區：去背 io Software logo + 置中版權宣告 */}
                    <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col items-center gap-3 text-center">
                        <a
                            href="https://iosoftware.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="io Software"
                            className="focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none rounded transition-opacity hover:opacity-80"
                        >
                            <img src="/logo_white_rect_transparent.svg" alt="io Software" className="h-20 w-auto" />
                        </a>
                        <p className="text-sm text-slate-400">© 2026 io Software. {t.footerRights}</p>
                    </div>
                </div>
            </footer>

            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </div>
    )
}

export default App
