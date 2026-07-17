import React, { useLayoutEffect, useRef, useState } from 'react'
import { useI18n, pick } from '../i18n'

// 面向開發者：讓別人不透過 UI、直接用指令 (curl / CLI / 任何 HTTP client) 呼叫 InvisiGuard API。
const STRINGS = {
    en: {
        eyebrow: 'Developers',
        title: 'Use InvisiGuard from the command line',
        intro: 'Every action in this app is a plain HTTP request. Point curl, a CLI, or any HTTP client at the API and send requests programmatically.',
        base: 'Base URL',
        baseNote: 'Set BASE once, then paste any command below. Use the local URL during development.',
        auth: 'Authentication',
        authNote: 'The watermark key lives on the server (WATERMARK_KEY). Requests do not carry it; the same relay key protects every mark.',
        endpoints: 'Endpoints',
        endpointsNote: 'Three endpoints cover the whole workflow: check the service, embed a mark, verify blind. All paths are relative to the base URL.',
        health: 'Health check',
        embed: 'Embed a watermark',
        embedNote: 'Multipart form: file, text, engine (classic | trustmark), certify (true returns the robustness report).',
        verify: 'Verify (blind)',
        verifyNote: 'Upload a suspect image; the response tells you whether a watermark was found and, for TrustMark, the registered text.',
        params: 'Parameters',
        required: 'required',
        optional: 'optional',
        respExample: 'Response',
        examples: 'Request examples',
        examplesNote: 'The same request in curl, Python (requests), and JavaScript (fetch). Pick a language and copy.',
        embedExample: 'Embed',
        verifyExample: 'Verify',
        errors: 'Error handling',
        errorsNote: 'Every error uses one envelope. Validation errors add field, value_provided, expected; processing errors add stage, recoverable.',
        errorEnvelope: 'Error envelope',
        codeCol: 'Error code',
        statusCol: 'HTTP',
        meaningCol: 'Meaning',
        engines: 'Engines',
        enginesNote: 'Two watermark engines sit behind one API. Choose per request with the engine parameter.',
        capacity: 'Capacity',
        robustness: 'Robustness',
        gpu: 'Hardware',
        bestFor: 'Best for',
        classicDesc: 'Keyed DWT-QIM. Fast, deterministic, runs anywhere.',
        trustmarkDesc: 'Deep-learning watermark tuned for lossy pipelines.',
        clsCapacity: 'Up to 92 UTF-8 bytes',
        clsRobust: 'Crop resistant',
        clsGpu: 'No GPU required',
        clsBest: 'Keyed, self-contained marks',
        tmCapacity: 'Short ID in a server registry (text up to 2000 chars)',
        tmRobust: 'Survives JPEG recompression and resize',
        tmGpu: 'Deep learning, GPU accelerated',
        tmBest: 'Social platforms',
        pFile: 'The image to protect (PNG or JPEG).',
        pText: 'Watermark text to embed.',
        pEngine: 'classic or trustmark. Defaults to classic.',
        pCertify: 'true also returns a robustness report.',
        pImage: 'The suspect image to check.',
        cli: 'Command-line tool',
        cliNote: 'A zero-dependency Python CLI wraps the same endpoints. See cli/invisiguard.py in the repository.',
        cliEnv: 'Override the target with the INVISIGUARD_API environment variable, or pass --base.',
        chooserAgentTitle: 'I am using an AI agent',
        chooserAgentDesc: 'Copy a complete English integration brief for Claude, Cursor, or any coding agent.',
        chooserDevTitle: 'I am reading the documentation',
        chooserDevDesc: 'The full API reference: endpoints, parameters, responses, and code examples.',
        modeAgent: 'AI agent',
        modeDocs: 'Documentation',
        agentTitle: 'Integration brief for AI agents',
        agentNote: 'A complete English integration brief covering the base URL, authentication model, every endpoint with parameters and response schemas, the error envelope, engine guidance, and the CLI. Paste it into your agent’s context to begin the integration.',
        agentCopy: 'Copy agent prompt',
        agentCopied: 'Copied',
        copy: 'Copy',
        copied: 'Copied',
    },
    zh: {
        eyebrow: '開發者',
        title: '用指令直接呼叫 InvisiGuard',
        intro: '這個介面上的每個動作，本質都是一個 HTTP 請求。用 curl、CLI 或任何 HTTP 客戶端指向 API，就能用程式化的方式送出請求。',
        base: '基礎網址 (Base URL)',
        baseNote: '先設定一次 BASE，下面的指令就能直接貼上使用；開發時請改用本機網址。',
        auth: '認證方式',
        authNote: '浮水印金鑰存在伺服器端（WATERMARK_KEY），請求本身不帶金鑰，同一把中繼金鑰保護所有浮水印。',
        endpoints: '端點',
        endpointsNote: '三個端點涵蓋完整流程：檢查服務、嵌入浮水印、盲驗證。所有路徑都相對於基礎網址。',
        health: '健康檢查',
        embed: '嵌入浮水印',
        embedNote: 'Multipart 表單：file、text、engine（classic | trustmark）、certify（true 會一併回傳穩健度實測報告）。',
        verify: '盲驗證',
        verifyNote: '上傳可疑圖片；回應會告訴你是否偵測到浮水印，TrustMark 還會回傳登錄的文字。',
        params: '參數',
        required: '必填',
        optional: '選填',
        respExample: '回應範例',
        examples: '請求範例',
        examplesNote: '同一個請求的 curl、Python（requests）、JavaScript（fetch）版本。挑一個語言直接複製。',
        embedExample: '嵌入',
        verifyExample: '驗證',
        errors: '錯誤處理',
        errorsNote: '所有錯誤共用同一個外層格式。驗證錯誤會加上 field、value_provided、expected；處理錯誤會加上 stage、recoverable。',
        errorEnvelope: '錯誤格式',
        codeCol: '錯誤代碼',
        statusCol: 'HTTP',
        meaningCol: '說明',
        engines: '演算法引擎',
        enginesNote: '同一組 API 背後有兩種浮水印引擎，透過 engine 參數逐次選擇。',
        capacity: '容量',
        robustness: '穩健度',
        gpu: '硬體',
        bestFor: '適用情境',
        classicDesc: '帶金鑰的 DWT-QIM，快速、可重現、隨處可跑。',
        trustmarkDesc: '為失真管線調校的深度學習浮水印。',
        clsCapacity: '最多 92 個 UTF-8 位元組',
        clsRobust: '抗裁切',
        clsGpu: '不需 GPU',
        clsBest: '帶金鑰、自帶完整資訊的浮水印',
        tmCapacity: '伺服器登錄的短 ID（文字上限 2000 字）',
        tmRobust: '可抵抗 JPEG 重壓縮與縮放',
        tmGpu: '深度學習，GPU 加速',
        tmBest: '社群平台',
        pFile: '要保護的圖片（PNG 或 JPEG）。',
        pText: '要嵌入的浮水印文字。',
        pEngine: 'classic 或 trustmark，預設為 classic。',
        pCertify: 'true 會一併回傳穩健度報告。',
        pImage: '要檢查的可疑圖片。',
        cli: '命令列工具',
        cliNote: '倉庫附了一支零相依的 Python CLI，封裝同一組端點，見 cli/invisiguard.py。',
        cliEnv: '用環境變數 INVISIGUARD_API 覆寫目標網址，或用 --base 指定。',
        chooserAgentTitle: '我使用 AI Agent',
        chooserAgentDesc: '複製一份完整的英文整合說明，交給 Claude、Cursor 或任何程式代理。',
        chooserDevTitle: '閱讀技術文件',
        chooserDevDesc: '完整 API 參考：端點、參數、回應與程式範例。',
        modeAgent: 'AI Agent',
        modeDocs: '技術文件',
        agentTitle: '給 AI Agent 的整合說明',
        agentNote: '一份完整的英文整合說明，涵蓋 Base URL、認證模式、各端點的參數與回應格式、錯誤格式、引擎建議與 CLI。貼入你的 Agent 上下文即可開始串接。',
        agentCopy: '複製 Agent Prompt',
        agentCopied: '已複製',
        copy: '複製',
        copied: '已複製',
    },
}

// ----------------------------------------------------------------------------
// Inline syntax highlighter (plain JS, no dependencies). Returns React nodes.
// Palette lives on the slate-950 terminal blocks: restrained, not rainbow.
// (A terminal is a terminal: the dark-slate INSIDE of these blocks is a
// component surface, not a theme. The page around them is light-only.)
//   comments  -> slate-500     strings  -> emerald-300   flags   -> sky-300
//   keywords  -> blue-300      vars/$   -> amber-300      numbers -> amber-300
//   json keys -> sky-300       default  -> slate-100
// ----------------------------------------------------------------------------
const P_STRING = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/
const P_VAR = /\$\{[^}]*\}|\$\w+/
const P_FLAG = /--?[A-Za-z][\w-]*/
const P_NUM = /\b(?:true|false|null|True|False|None)\b|\b\d+(?:\.\d+)?\b/

function buildCodeRe(commentSrc, keywords) {
    const kw = '\\b(?:' + keywords.join('|') + ')\\b'
    const src =
        '(' + commentSrc + ')' +
        '|(' + P_STRING.source + ')' +
        '|(' + P_VAR.source + ')' +
        '|(' + P_FLAG.source + ')' +
        '|(' + kw + ')' +
        '|(' + P_NUM.source + ')'
    return new RegExp(src, 'g')
}

const RE_SHELL = buildCodeRe('#[^\\n]*', ['curl', 'export', 'python', 'python3', 'echo', 'cat', 'GET', 'POST', 'PUT', 'DELETE'])
const RE_PY = buildCodeRe('#[^\\n]*', ['import', 'from', 'with', 'as', 'open', 'print', 'requests', 'def', 'return'])
const RE_JS = buildCodeRe('//[^\\n]*', ['const', 'let', 'var', 'new', 'await', 'async', 'function', 'return', 'fetch', 'console'])

const JSON_RE = new RegExp(
    '(' + P_STRING.source + ')(\\s*:)?' +
    '|(\\btrue\\b|\\bfalse\\b|\\bnull\\b)' +
    '|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)',
    'g'
)

const codeReFor = (lang) => (lang === 'python' ? RE_PY : lang === 'js' ? RE_JS : RE_SHELL)

function classifyCode(m) {
    if (m[1] != null) return [{ text: m[1], cls: 'text-slate-500' }]
    if (m[2] != null) return [{ text: m[2], cls: 'text-emerald-300' }]
    if (m[3] != null) return [{ text: m[3], cls: 'text-amber-300' }]
    if (m[4] != null) return [{ text: m[4], cls: 'text-sky-300' }]
    if (m[5] != null) return [{ text: m[5], cls: 'text-blue-300' }]
    return [{ text: m[6], cls: 'text-amber-300' }]
}

function classifyJson(m) {
    if (m[1] != null) {
        const isKey = m[2] != null
        const parts = [{ text: m[1], cls: isKey ? 'text-sky-300' : 'text-emerald-300' }]
        if (isKey) parts.push({ text: m[2], cls: null })
        return parts
    }
    if (m[3] != null) return [{ text: m[3], cls: 'text-amber-300' }]
    return [{ text: m[4], cls: 'text-amber-300' }]
}

function renderTokens(code, re, classify) {
    const out = []
    let last = 0
    let key = 0
    let m
    re.lastIndex = 0
    while ((m = re.exec(code)) !== null) {
        if (m.index > last) out.push(code.slice(last, m.index))
        const parts = classify(m)
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i]
            out.push(p.cls ? <span key={key++} className={p.cls}>{p.text}</span> : p.text)
        }
        last = m.index + m[0].length
        if (m[0].length === 0) re.lastIndex++
    }
    if (last < code.length) out.push(code.slice(last))
    return out
}

const Highlighted = ({ code, lang }) => {
    const nodes = lang === 'json'
        ? renderTokens(code, JSON_RE, classifyJson)
        : renderTokens(code, codeReFor(lang), classifyCode)
    return <>{nodes}</>
}

// ----------------------------------------------------------------------------
// Inline SVG icons (no new imports; keep the inline-component pattern).
// ----------------------------------------------------------------------------
const CopyIcon = () => (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
)

// R6 success check: the check pops in with a spring scale when copy succeeds.
const CheckIcon = () => (
    <svg className="h-3.5 w-3.5 animate-pop-in" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
    </svg>
)

const LockIcon = () => (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
)

// AI sparkle（Gemini 式四角星芒）：以內凹曲線構成的四角星，實心填色。
const SparkleIcon = () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.9 5.2 4.8 9.1 10 10-5.2.9-9.1 4.8-10 10-.9-5.2-4.8-9.1-10-10 5.2-.9 9.1-4.8 10-10z" />
    </svg>
)

const BookIcon = () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
)

const MethodPill = ({ method }) => (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-mono font-semibold tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
        {method}
    </span>
)

// ----------------------------------------------------------------------------
// Terminal block with copy button. Optional language tabs share the top bar.
// R1: a measured pill glides behind the active language tab (presentational
// refs/state only). R2: spring press on tabs + copy. R6: check pops on copy.
// ----------------------------------------------------------------------------
const CmdBlock = ({ code, lang = 'shell', tabs, copyLabel, copiedLabel }) => {
    const hasTabs = Array.isArray(tabs) && tabs.length > 0
    const [active, setActive] = useState(0)
    const [copied, setCopied] = useState(false)
    // R1 tab pill glide: measure the active tab so the pill can slide to it.
    const tabRefs = useRef([])
    const [pill, setPill] = useState({ left: 0, width: 0, ready: false })
    useLayoutEffect(() => {
        if (!hasTabs) return
        const el = tabRefs.current[active]
        if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true })
    }, [hasTabs, active])
    const cur = hasTabs ? tabs[active] : { code, lang }
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(cur.code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
        } catch { /* ignore */ }
    }
    return (
        <div className="relative rounded-xl border border-slate-800 bg-slate-950 shadow-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/60 px-3 py-2">
                {hasTabs ? (
                    <div role="tablist" aria-label="Language" className="relative flex items-center gap-1">
                        {pill.ready && (
                            <span
                                aria-hidden="true"
                                className="absolute top-0 bottom-0 rounded-md bg-slate-700 transition-[left,width] duration-[400ms] ease-glide"
                                style={{ left: pill.left, width: pill.width }}
                            />
                        )}
                        {tabs.map((tb, i) => (
                            <button
                                key={tb.id}
                                ref={(el) => { tabRefs.current[i] = el }}
                                role="tab"
                                aria-selected={i === active}
                                onClick={() => { setActive(i); setCopied(false) }}
                                className={`relative rounded-md px-2.5 py-1 text-xs font-medium transition-[color,background-color,transform] duration-200 ease-spring active:scale-[0.96] ${i === active ? 'text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                            >
                                {tb.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5" aria-hidden="true">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                    </div>
                )}
                <button
                    onClick={onCopy}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-spring active:scale-[0.96] ${copied ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    {copied ? copiedLabel : copyLabel}
                </button>
            </div>
            <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono text-slate-100"><code><Highlighted code={cur.code} lang={cur.lang} /></code></pre>
        </div>
    )
}

const SectionHeader = ({ title, note }) => (
    <div>
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
        {note && <p className="mt-1.5 text-sm text-slate-500 max-w-[65ch]">{note}</p>}
    </div>
)

const BlockLabel = ({ children }) => (
    <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-slate-400">{children}</div>
)

const statusClass = (s) => (s >= 500 ? 'text-rose-600' : s >= 400 ? 'text-amber-600' : 'text-emerald-600')

const ERROR_ROWS = [
    { code: 'INVALID_ENGINE', status: 400, key: 'errInvalidEngine' },
    { code: 'INVALID_FILE_FORMAT', status: 400, key: 'errInvalidFormat' },
    { code: 'EMPTY_WATERMARK_TEXT', status: 400, key: 'errEmptyText' },
    { code: 'TEXT_TOO_LONG', status: 400, key: 'errTextLong' },
    { code: 'FILE_TOO_LARGE', status: 400, key: 'errFileLarge' },
    { code: 'IMAGE_TOO_LARGE', status: 400, key: 'errImageLarge' },
    { code: 'IMAGE_TOO_SMALL', status: 400, key: 'errImageSmall' },
    { code: 'IMAGE_DECODE_ERROR', status: 400, key: 'errDecode' },
    { code: 'WATERMARK_VERIFICATION_FAILED', status: 400, key: 'errVerifyFailed' },
    { code: 'EMBED_NOT_RECOVERABLE', status: 422, key: 'errNotRecoverable' },
    { code: 'ENGINE_UNAVAILABLE', status: 503, key: 'errEngineUnavail' },
    { code: 'INTERNAL_SERVER_ERROR', status: 500, key: 'errInternal' },
]

const ERROR_MEANINGS = {
    en: {
        errInvalidEngine: 'engine must be classic or trustmark.',
        errInvalidFormat: 'The upload is not a supported image format.',
        errEmptyText: 'The text field was empty.',
        errTextLong: 'Text exceeds the engine capacity.',
        errFileLarge: 'The file exceeds the size limit.',
        errImageLarge: 'Image dimensions exceed the maximum.',
        errImageSmall: 'Image dimensions are below the minimum.',
        errDecode: 'The image could not be decoded.',
        errVerifyFailed: 'No watermark was found in the image.',
        errNotRecoverable: 'The mark could not be embedded recoverably.',
        errEngineUnavail: 'The requested engine is not available.',
        errInternal: 'An unexpected server error occurred.',
    },
    zh: {
        errInvalidEngine: 'engine 必須是 classic 或 trustmark。',
        errInvalidFormat: '上傳的檔案不是支援的圖片格式。',
        errEmptyText: 'text 欄位是空的。',
        errTextLong: '文字超過引擎容量。',
        errFileLarge: '檔案超過大小上限。',
        errImageLarge: '圖片尺寸超過上限。',
        errImageSmall: '圖片尺寸低於下限。',
        errDecode: '圖片無法解碼。',
        errVerifyFailed: '在圖片中找不到浮水印。',
        errNotRecoverable: '無法嵌入可還原的浮水印。',
        errEngineUnavail: '請求的引擎目前無法使用。',
        errInternal: '伺服器發生未預期的錯誤。',
    },
}

export default function DevelopersTab() {
    const { lang } = useI18n()
    const t = pick(STRINGS, lang)
    const em = pick(ERROR_MEANINGS, lang)
    const copy = t.copy
    const copied = t.copied

    // R4 stagger entrance: top-level blocks cascade in on mount (same
    // animate-fade-up + animationDelay pattern as the other tabs).
    const staggerAt = (i) => ({ animationDelay: `${i * 60}ms` })

    // Commands (exact strings, base URLs, endpoint paths, field names preserved).
    const baseCmd = `BASE=https://invisiguard.iosoftware.ai/api/v1   # local: http://localhost:8000/v1`
    const healthCmd = `curl "$BASE/health"`

    const curlEmbed = `curl -X POST "$BASE/embed" \\
  -F "file=@image.png;type=image/png" \\
  -F "text=Copyright 2026 ACME" \\
  -F "engine=classic" \\
  -F "certify=true"`

    const pyEmbed = `import requests

BASE = "https://invisiguard.iosoftware.ai/api/v1"

with open("image.png", "rb") as f:
    r = requests.post(
        f"{BASE}/embed",
        files={"file": f},
        data={"text": "Copyright 2026 ACME", "engine": "classic", "certify": "true"},
    )

print(r.json())`

    const jsEmbed = `const BASE = 'https://invisiguard.iosoftware.ai/api/v1'

const form = new FormData()
form.append('file', fileInput.files[0])
form.append('text', 'Copyright 2026 ACME')
form.append('engine', 'classic')
form.append('certify', 'true')

const res = await fetch(\`\${BASE}/embed\`, { method: 'POST', body: form })
const data = await res.json()
console.log(data)`

    const curlVerify = `curl -X POST "$BASE/verify" \\
  -F "image=@watermarked.png;type=image/png" \\
  -F "engine=classic"`

    const pyVerify = `import requests

BASE = "https://invisiguard.iosoftware.ai/api/v1"

with open("watermarked.png", "rb") as f:
    r = requests.post(f"{BASE}/verify", files={"image": f}, data={"engine": "classic"})

print(r.json())`

    const jsVerify = `const BASE = 'https://invisiguard.iosoftware.ai/api/v1'

const form = new FormData()
form.append('image', fileInput.files[0])
form.append('engine', 'classic')

const res = await fetch(\`\${BASE}/verify\`, { method: 'POST', body: form })
const data = await res.json()
console.log(data)`

    const cliCmd = `export INVISIGUARD_API=http://localhost:8000/v1   # or the deployed API base

python cli/invisiguard.py health

python cli/invisiguard.py embed image.png \\
  --text "Copyright 2026 ACME" --engine classic --certify --out marked.png

python cli/invisiguard.py verify watermarked.png --engine classic`

    // Response examples (from the API contract).
    const healthResp = `{ "status": "ok", "service": "InvisiGuard API" }`

    const embedResp = `{
  "status": "success",
  "data": {
    "image_url": "https://invisiguard.iosoftware.ai/static/processed/watermarked.png",
    "signal_map_url": "https://invisiguard.iosoftware.ai/static/processed/signal.png",
    "psnr": 45.2,
    "ssim": 0.994,
    "engine": "classic",
    "watermark_id": null,
    "robustness": {
      "jpeg_recompression": true,
      "resize": true,
      "crop": true
    }
  }
}`

    const verifyResp = `{
  "status": "success",
  "data": {
    "verified": true,
    "watermark_text": "Copyright 2026 ACME",
    "confidence": 0.98,
    "metadata": null
  }
}`

    const errorResp = `{
  "status": "error",
  "error_code": "TEXT_TOO_LONG",
  "message": "Watermark text exceeds the capacity for this engine.",
  "suggestion": "Shorten the text, or switch engine to trustmark.",
  "details": {
    "field": "text",
    "value_provided": 128,
    "expected": "at most 92 bytes"
  }
}`

    // 給 AI Agent 的完整英文整合說明：直接由本頁的指令與回應範例變數組成，
    // 單一事實來源：頁面文件更新時 prompt 自動同步，永不漂移。
    const agentPrompt = `You are integrating the InvisiGuard API, an invisible image watermarking service by io Software. Use this brief as the complete integration contract; you do not need any other documentation.

## Base URL
Production: https://invisiguard.iosoftware.ai/api/v1
Local development: http://localhost:8000/v1
(Set it once as $BASE and reuse it in every request.)

## Authentication
No API key travels with requests. The watermark secret (WATERMARK_KEY) lives on the server and every mark is derived from it. Do not add auth headers.

## Endpoints

### 1. GET /health
Liveness check.
Response:
${healthResp}

### 2. POST /embed (multipart/form-data)
Fields:
- file (required): the image to protect, PNG or JPEG.
- text (required): the watermark text to embed.
- engine (optional): "classic" (default) or "trustmark".
- certify (optional): "true" to run a live attack battery and include a robustness report.
Success response:
${embedResp}
Notes: with engine=trustmark, data.watermark_id is a short ID and the full text is stored in a server-side registry. Download the watermarked image from data.image_url and keep it as lossless PNG for best durability.

### 3. POST /verify (multipart/form-data, blind: no original image needed)
Fields:
- image (required): the suspect image to check.
- engine (optional): "classic" (default) or "trustmark".
Success response:
${verifyResp}

## Error envelope (all errors)
${errorResp}
Validation errors add details.field / details.value_provided / details.expected; processing errors add details.stage / details.recoverable. HTTP 503 with error_code ENGINE_UNAVAILABLE means the deep-learning engine is not enabled on this server; fall back to engine=classic.

## Engines
- classic: keyed DWT-QIM. Embeds up to 92 UTF-8 bytes directly in pixels. Crop-resistant, deterministic, no GPU required. Best for keyed, self-contained marks and offline proof.
- trustmark: deep-learning watermark. Embeds a short ID; the registered text (up to 2000 chars) lives in the server registry. Survives JPEG recompression and resizing; best for images shared on social platforms.

## Example (curl)
${curlEmbed}

## Command-line tool (zero-dependency Python, wraps the same endpoints)
${cliCmd}

## Integration rules
- Always send multipart/form-data for /embed and /verify.
- Treat the verify response's verified/confidence fields as the source of truth for detection.
- Prefer engine=trustmark for social-platform pipelines and engine=classic for maximum text capacity or offline proof.
- Surface the error envelope's "suggestion" field to end users.
- Keep watermarked output as PNG; re-encoding to JPEG weakens the classic mark.`

    // 受眾分流：進入頁面先選「AI Agent / 技術文件」，選定後可用小切換器互換。
    const [mode, setMode] = useState(null)
    const [agentCopied, setAgentCopied] = useState(false)
    const copyAgentPrompt = async () => {
        try {
            await navigator.clipboard.writeText(agentPrompt)
            setAgentCopied(true)
            setTimeout(() => setAgentCopied(false), 1800)
        } catch { /* clipboard 不可用時靜默忽略 */ }
    }

    const embedParams = [
        { name: 'file', req: true, desc: t.pFile },
        { name: 'text', req: true, desc: t.pText },
        { name: 'engine', req: false, desc: t.pEngine },
        { name: 'certify', req: false, desc: t.pCertify },
    ]
    const verifyParams = [
        { name: 'image', req: true, desc: t.pImage },
        { name: 'engine', req: false, desc: t.pEngine },
    ]

    const endpointDefs = [
        { method: 'GET', path: '/health', label: t.health, note: null, params: [], resp: healthResp },
        { method: 'POST', path: '/embed', label: t.embed, note: t.embedNote, params: embedParams, resp: embedResp },
        { method: 'POST', path: '/verify', label: t.verify, note: t.verifyNote, params: verifyParams, resp: verifyResp },
    ]

    const embedTabs = [
        { id: 'curl', label: 'curl', lang: 'shell', code: curlEmbed },
        { id: 'python', label: 'Python', lang: 'python', code: pyEmbed },
        { id: 'js', label: 'JavaScript', lang: 'js', code: jsEmbed },
    ]
    const verifyTabs = [
        { id: 'curl', label: 'curl', lang: 'shell', code: curlVerify },
        { id: 'python', label: 'Python', lang: 'python', code: pyVerify },
        { id: 'js', label: 'JavaScript', lang: 'js', code: jsVerify },
    ]

    const engineCards = [
        {
            name: 'classic', desc: t.classicDesc,
            rows: [
                { label: t.capacity, value: t.clsCapacity },
                { label: t.robustness, value: t.clsRobust },
                { label: t.gpu, value: t.clsGpu },
                { label: t.bestFor, value: t.clsBest },
            ],
        },
        {
            name: 'trustmark', desc: t.trustmarkDesc,
            rows: [
                { label: t.capacity, value: t.tmCapacity },
                { label: t.robustness, value: t.tmRobust },
                { label: t.gpu, value: t.tmGpu },
                { label: t.bestFor, value: t.tmBest },
            ],
        },
    ]

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 sm:p-8">
            <div className="max-w-[65ch] animate-fade-up" style={staggerAt(0)}>
                <span className="text-xs font-semibold tracking-[0.18em] text-blue-600">{t.eyebrow}</span>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{t.title}</h2>
                <p className="mt-2.5 text-slate-600">{t.intro}</p>
            </div>

            {/* 受眾分流：進入頁面先選擇閱讀路徑（Agent / 技術文件） */}
            {mode === null && (
                <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2 animate-fade-up" style={staggerAt(1)}>
                    <button
                        type="button"
                        onClick={() => setMode('agent')}
                        className="group flex flex-col items-center text-center rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-card transition-[transform,box-shadow,border-color] duration-300 ease-glide hover:-translate-y-1 hover:border-blue-300 hover:shadow-card-hover active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                    >
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-accent-sm">
                            <SparkleIcon />
                        </span>
                        <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">{t.chooserAgentTitle}</h3>
                        <p className="mt-1.5 text-sm text-slate-500 max-w-[28ch]">{t.chooserAgentDesc}</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('docs')}
                        className="group flex flex-col items-center text-center rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-card transition-[transform,box-shadow,border-color] duration-300 ease-glide hover:-translate-y-1 hover:border-blue-300 hover:shadow-card-hover active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                    >
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                            <BookIcon />
                        </span>
                        <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">{t.chooserDevTitle}</h3>
                        <p className="mt-1.5 text-sm text-slate-500 max-w-[28ch]">{t.chooserDevDesc}</p>
                    </button>
                </div>
            )}

            {/* 已選定路徑：提供小型切換器，兩種內容可互換 */}
            {mode !== null && (
                <div className="mt-8 flex justify-center">
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                        <button
                            type="button"
                            onClick={() => setMode('agent')}
                            aria-pressed={mode === 'agent'}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-[color,background-color,transform] duration-200 ease-spring active:scale-[0.96] ${mode === 'agent' ? 'bg-white text-blue-700 shadow-card' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {t.modeAgent}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('docs')}
                            aria-pressed={mode === 'docs'}
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition-[color,background-color,transform] duration-200 ease-spring active:scale-[0.96] ${mode === 'docs' ? 'bg-white text-blue-700 shadow-card' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {t.modeDocs}
                        </button>
                    </div>
                </div>
            )}

            {/* Agent 路徑：整合說明 + 一鍵複製（不提供預覽，內容以複製為準） */}
            {mode === 'agent' && (
                <section className="mx-auto mt-6 max-w-4xl rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:p-6 animate-fade-up">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                        <div className="flex min-w-0 flex-1 items-start gap-3.5">
                            <span className="shrink-0 mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-accent-sm">
                                <SparkleIcon />
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-base font-semibold tracking-tight text-blue-900">{t.agentTitle}</h3>
                                <p className="mt-1 text-sm text-blue-800/80 max-w-[65ch]">{t.agentNote}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={copyAgentPrompt}
                            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-accent-sm transition-[background-color,transform] duration-200 ease-spring hover:bg-blue-700 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus:outline-none"
                        >
                            {agentCopied ? (
                                <><span className="animate-pop-in inline-flex"><CheckIcon /></span> {t.agentCopied}</>
                            ) : (
                                <><CopyIcon /> {t.agentCopy}</>
                            )}
                        </button>
                    </div>
                </section>
            )}

            {mode === 'docs' && (
                <div className="mx-auto mt-6 space-y-10 max-w-4xl animate-fade-up">
                    {/* Base URL */}
                    <section className="space-y-3 animate-fade-up" style={staggerAt(1)}>
                        <SectionHeader title={t.base} note={t.baseNote} />
                        <CmdBlock code={baseCmd} lang="shell" copyLabel={copy} copiedLabel={copied} />
                    </section>

                    {/* Authentication */}
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 animate-fade-up" style={staggerAt(2)}>
                        <div className="flex items-center gap-2 text-blue-900">
                            <LockIcon />
                            <h3 className="text-sm font-semibold tracking-tight">{t.auth}</h3>
                        </div>
                        <p className="mt-1.5 text-sm text-blue-800/80 max-w-[65ch]">{t.authNote}</p>
                    </div>

                    {/* Endpoints */}
                    <section className="space-y-4 animate-fade-up" style={staggerAt(3)}>
                        <SectionHeader title={t.endpoints} note={t.endpointsNote} />
                        <div className="space-y-4">
                            {endpointDefs.map((ep) => (
                                <div key={ep.path} className="rounded-2xl border border-slate-200 bg-white shadow-card overflow-hidden">
                                    <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                                        <MethodPill method={ep.method} />
                                        <code className="font-mono text-sm text-slate-900">{ep.path}</code>
                                        <span className="text-sm text-slate-500">{ep.label}</span>
                                    </div>
                                    <div className="space-y-4 p-5">
                                        {ep.note && <p className="text-sm text-slate-500 max-w-[65ch]">{ep.note}</p>}
                                        {ep.params.length > 0 && (
                                            <div>
                                                <BlockLabel>{t.params}</BlockLabel>
                                                <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                                                    {ep.params.map((p) => (
                                                        <div key={p.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                            <code className="font-mono text-[13px] font-medium text-blue-700">{p.name}</code>
                                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${p.req ? 'bg-blue-50 text-blue-700 ring-blue-100' : 'text-slate-500 ring-slate-200'}`}>{p.req ? t.required : t.optional}</span>
                                                            <span className="text-sm text-slate-500">{p.desc}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <BlockLabel>{t.respExample}</BlockLabel>
                                            <CmdBlock code={ep.resp} lang="json" copyLabel={copy} copiedLabel={copied} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Request examples (multi-language) */}
                    <section className="space-y-4 animate-fade-up" style={staggerAt(4)}>
                        <SectionHeader title={t.examples} note={t.examplesNote} />
                        <div className="space-y-3">
                            <BlockLabel>{`${t.embedExample}  ·  POST /embed`}</BlockLabel>
                            <CmdBlock tabs={embedTabs} copyLabel={copy} copiedLabel={copied} />
                        </div>
                        <div className="space-y-3">
                            <BlockLabel>{`${t.verifyExample}  ·  POST /verify`}</BlockLabel>
                            <CmdBlock tabs={verifyTabs} copyLabel={copy} copiedLabel={copied} />
                        </div>
                    </section>

                    {/* Error handling */}
                    <section className="space-y-4 animate-fade-up" style={staggerAt(5)}>
                        <SectionHeader title={t.errors} note={t.errorsNote} />
                        <div>
                            <BlockLabel>{t.errorEnvelope}</BlockLabel>
                            <CmdBlock code={errorResp} lang="json" copyLabel={copy} copiedLabel={copied} />
                        </div>
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-card">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50/60 text-[11px] tracking-[0.12em] text-slate-400">
                                    <tr>
                                        <th className="px-4 py-2.5 font-semibold">{t.codeCol}</th>
                                        <th className="px-4 py-2.5 font-semibold">{t.statusCol}</th>
                                        <th className="px-4 py-2.5 font-semibold">{t.meaningCol}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {ERROR_ROWS.map((r) => (
                                        <tr key={r.code}>
                                            <td className="whitespace-nowrap px-4 py-2.5"><code className="font-mono text-[12px] text-slate-700">{r.code}</code></td>
                                            <td className="px-4 py-2.5"><span className={`font-mono tabular-nums font-semibold ${statusClass(r.status)}`}>{r.status}</span></td>
                                            <td className="px-4 py-2.5 text-slate-500">{em[r.key]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Engines comparison */}
                    <section className="space-y-4 animate-fade-up" style={staggerAt(6)}>
                        <SectionHeader title={t.engines} note={t.enginesNote} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            {engineCards.map((card) => (
                                <div key={card.name} className="rounded-2xl border border-slate-200 bg-white shadow-card p-5 sm:p-6">
                                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">{card.name}</span>
                                    <p className="mt-2.5 text-sm text-slate-500">{card.desc}</p>
                                    <dl className="mt-4 space-y-2.5">
                                        {card.rows.map((row) => (
                                            <div key={row.label} className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
                                                <dt className="text-slate-400">{row.label}</dt>
                                                <dd className="text-slate-700">{row.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* CLI reference */}
                    <section className="space-y-3 animate-fade-up" style={staggerAt(7)}>
                        <SectionHeader title={t.cli} note={t.cliNote} />
                        <CmdBlock code={cliCmd} lang="shell" copyLabel={copy} copiedLabel={copied} />
                        <p className="text-sm text-slate-500 max-w-[65ch]">{t.cliEnv}</p>
                    </section>
                </div>
            )}
        </div>
    )
}
