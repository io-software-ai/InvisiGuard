import React, { useState } from 'react';
import api from '../services/api';
import Dropzone from './Dropzone';
import EngineSelector from './EngineSelector';
import { ENGINE_TRUSTMARK } from '../utils/validation';
import { getConfidenceTier } from '../utils/format';
import { useI18n, pick } from '../i18n';

// phase/origin 從後端來是 tuple，JSON 化後為陣列（如 [3, 1]）。
// 直接當 React children 會被串接成 "31"，故格式化為 "(3, 1)"。
const formatPair = (value) =>
    Array.isArray(value) ? `(${value.join(', ')})` : String(value);

const STRINGS = {
    en: {
        blindTitle: 'Blind Verification',
        blindDesc: 'This mode detects watermarks without the original image. It scans pixel phase and tile-origin offsets to recover the watermark after cropping or moderate JPEG compression. Rotation and scaling are not supported in blind mode.',
        trustmarkNote: 'TrustMark decodes a short ID embedded in the image, then looks up the full text from the server registry.',
        suspectImage: 'Suspect Image',
        selected: 'Selected',
        uploadPrompt: 'Upload Image to Verify',
        verify: 'Verify Watermark',
        verifying: 'Verifying...',
        engineUnavailableTitle: 'Deep Learning Engine Unavailable',
        engineUnavailableDefaultMessage: 'This server does not have the deep learning engine (TrustMark) enabled.',
        engineUnavailableDefaultSuggestion: "Please switch to the 'Classic' engine.",
        genericTryAgain: 'Please try again.',
        genericVerifyError: 'Verification failed. Please check that the image format is correct and your network connection, then try again.',
        verificationStatus: 'Verification Status',
        detected: 'Watermark Detected',
        notDetected: 'No Watermark Found',
        payloadMessage: 'Payload Message',
        possibleReasonLabel: 'Possible reason:',
        possibleReasonBody: 'The image may have been cropped or rotated; blind verification does not correct for rotation or scaling. If you have the original image, switch to the "Extract (With Original)" tab to align it and try again.',
        confidenceScore: 'Confidence Score',
        watermarkId: 'Watermark ID',
        registeredAt: 'Registered At',
        technicalDetails: 'Technical Details',
        method: 'Method',
        phase: 'Phase',
        origin: 'Origin',
        signalCoverage: 'Signal Coverage',
        signalCoverageValue: (decoded, total) => `Signal coverage: ${decoded}/${total} tiles`,
        voteAgreement: 'Vote Agreement',
        note: 'Note',
        readyTitle: 'Ready to verify',
        readyBody: 'Upload a suspect image to check for watermarks',
    },
    zh: {
        blindTitle: '盲驗證',
        blindDesc: '此模式在沒有原始圖片的情況下偵測浮水印：透過掃描像素相位與圖塊原點偏移，即可在裁切或中度 JPEG 壓縮後復原浮水印；但盲驗證不支援旋轉與縮放校正。',
        trustmarkNote: 'TrustMark 會解碼影像中的短 ID，並反查伺服器登錄表取得完整文字。',
        suspectImage: '可疑圖片',
        selected: '已選擇',
        uploadPrompt: '上傳圖片以驗證',
        verify: '驗證浮水印',
        verifying: '驗證中…',
        engineUnavailableTitle: '深度學習引擎未啟用',
        engineUnavailableDefaultMessage: '此伺服器未啟用深度學習引擎（TrustMark）。',
        engineUnavailableDefaultSuggestion: '請改用「Classic」引擎。',
        genericTryAgain: '請再試一次。',
        genericVerifyError: '驗證發生錯誤，請確認圖片格式正確並檢查網路連線後再試一次。',
        verificationStatus: '驗證狀態',
        detected: '偵測到浮水印',
        notDetected: '未偵測到浮水印',
        payloadMessage: '浮水印內容',
        possibleReasonLabel: '可能原因：',
        possibleReasonBody: '圖片可能經過裁切或旋轉，而盲驗證不支援旋轉／縮放校正。如果你持有原始圖片，建議改用「Extract (With Original)」分頁上傳原圖進行幾何對齊後再試一次。',
        confidenceScore: '信心度',
        watermarkId: '浮水印 ID',
        registeredAt: '登錄時間',
        technicalDetails: '技術細節',
        method: '方法',
        phase: '相位',
        origin: '原點',
        signalCoverage: '訊號覆蓋',
        signalCoverageValue: (decoded, total) => `訊號覆蓋 ${decoded}/${total} 區塊`,
        voteAgreement: '投票一致度',
        note: '備註',
        readyTitle: '準備好進行驗證',
        readyBody: '上傳可疑圖片以檢查是否含有浮水印',
    },
};

const SearchIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
    </svg>
)

// VerifyTab 為受控元件：engine 由 App 統一管理並跨 Embed/Extract/Verify 三分頁共用，
// 避免使用者在三處各自選了不同引擎卻不自知。
export const VerifyTab = ({ engine, onEngineChange, addToast }) => {
  const { lang } = useI18n();
  const t = pick(STRINGS, lang);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [engineUnavailable, setEngineUnavailable] = useState(null);

  const notify = (message, type = 'error') => {
    if (typeof addToast === 'function') {
      addToast(message, type);
    }
  };

  const handleFileSelect = (selectedFile) => {
    setFile(selectedFile);
    setFilePreview(URL.createObjectURL(selectedFile));
    setVerificationResult(null);
    setEngineUnavailable(null);
  };

  const handleVerify = async () => {
    if (!file) return;
    setLoading(true);
    setEngineUnavailable(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('engine', engine);

    try {
      const res = await api.post('/verify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setVerificationResult(res.data.data);
    } catch (err) {
      console.error(err);
      const errorData = err.response?.data;
      if (err.response?.status === 503 && errorData?.error_code === 'ENGINE_UNAVAILABLE') {
        // 深度學習軌未安裝：顯示友善訊息而非泛用 alert
        setEngineUnavailable({
          message: errorData.message || t.engineUnavailableDefaultMessage,
          suggestion: errorData.suggestion || t.engineUnavailableDefaultSuggestion,
        });
      } else if (errorData?.message) {
        notify(`${errorData.message}\n${errorData.suggestion || t.genericTryAgain}`, 'error');
      } else {
        notify(t.genericVerifyError, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const confidenceTier = verificationResult?.confidence != null
    ? getConfidenceTier(verificationResult.confidence)
    : null;

  const metadata = verificationResult?.metadata;
  const hasTechnicalDetails = !!(metadata && (
    metadata.phase != null ||
    metadata.origin != null ||
    (metadata.tiles_decoded != null && metadata.tiles_total != null) ||
    metadata.vote_agreement != null
  ));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
        {/* Left Column: Input */}
        <div className="lg:col-span-5 space-y-6">
            <div className="bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900/50 p-5 sm:p-6">
                <h3 className="text-blue-900 dark:text-blue-200 font-semibold tracking-tight mb-3 flex items-center gap-2">
                    <SearchIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    {t.blindTitle}
                </h3>
                <p className="text-sm text-blue-800/80 dark:text-blue-300/80 leading-relaxed max-w-[65ch]">
                    {t.blindDesc}
                </p>
            </div>

            <div>
                <EngineSelector engine={engine} onChange={onEngineChange} disabled={loading} />
                {engine === ENGINE_TRUSTMARK && (
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 max-w-[65ch]">
                        {t.trustmarkNote}
                    </p>
                )}
            </div>

            <div className="bg-white dark:bg-slate-900">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-4 flex items-center justify-between">
                    <span>{t.suspectImage}</span>
                    {file && <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-medium">{t.selected}</span>}
                </h2>
                <Dropzone onFileSelect={handleFileSelect} label={file ? file.name : t.uploadPrompt} />
            </div>

            {filePreview && (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-card">
                    <img src={filePreview} alt="Preview" className="w-full h-48 object-cover bg-slate-50 dark:bg-slate-800" />
                </div>
            )}

            {engineUnavailable && (
                <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 p-4 flex gap-3">
                    <div className="shrink-0 mt-0.5">
                        <svg className="h-5 w-5 text-amber-500 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t.engineUnavailableTitle}</h3>
                        <div className="mt-1 text-sm text-amber-700/80 dark:text-amber-300/80">
                            {engineUnavailable.message}
                            {engineUnavailable.suggestion && <div className="mt-1">{engineUnavailable.suggestion}</div>}
                        </div>
                    </div>
                </div>
            )}

            <button
                onClick={handleVerify}
                disabled={!file || loading}
                className={`
                    w-full py-3.5 rounded-xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 disabled:pointer-events-none
                    ${!file
                        ? 'bg-slate-200 text-slate-400 shadow-none dark:bg-slate-800 dark:text-slate-600'
                        : 'bg-blue-600 text-white shadow-accent hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50'}
                `}
            >
                {loading ? (
                    <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t.verifying}
                    </>
                ) : (
                    <>
                        <SearchIcon className="w-5 h-5" />
                        {t.verify}
                    </>
                )}
            </button>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-7">
            {verificationResult ? (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card h-full flex flex-col p-5 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-6 bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 mb-6 text-center">
                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{t.verificationStatus}</div>
                        {verificationResult.verified ? (
                            <div className="inline-flex items-center gap-2 px-6 py-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full font-semibold text-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                {t.detected}
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 px-6 py-2 bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 rounded-full font-semibold text-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                {t.notDetected}
                            </div>
                        )}
                    </div>

                    <div className="space-y-6">
                        {verificationResult.verified && (
                            <div className="text-center">
                                <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.payloadMessage}</label>
                                <div className="mt-2 text-2xl font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400 break-all p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/50">
                                    {verificationResult.watermark_text}
                                </div>
                            </div>
                        )}

                        {!verificationResult.verified && (
                            <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 p-4 leading-relaxed">
                                <strong className="text-slate-700 dark:text-slate-200">{t.possibleReasonLabel}</strong>{t.possibleReasonBody}
                            </div>
                        )}

                        {confidenceTier && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.confidenceScore}</div>
                                    <div className={`font-mono tabular-nums font-semibold text-lg ${confidenceTier.textClass}`}>
                                        {confidenceTier.pct}%
                                    </div>
                                </div>

                                {/* trustmark 的登錄表資訊為使用者關心的主要內容，留在主視覺區 */}
                                {metadata?.watermark_id && (
                                    <div className="p-4 bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.watermarkId}</div>
                                        <div className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 text-sm break-all">
                                            {metadata.watermark_id}
                                        </div>
                                    </div>
                                )}
                                {metadata?.created_at && (
                                    <div className="p-4 bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.registeredAt}</div>
                                        <div className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 text-sm">
                                            {metadata.created_at}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 工程 debug 欄位預設收合，主視覺只留白話結論 + 信心度 */}
                        {(hasTechnicalDetails || metadata?.method || metadata?.note) && (
                            <details className="group bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 flex items-center justify-between">
                                    <span>{t.technicalDetails}</span>
                                    <span className="text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180">▾</span>
                                </summary>
                                <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                                    {metadata?.method && (
                                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t.method}</div>
                                            <div className="font-mono tabular-nums font-medium text-slate-600 dark:text-slate-300 text-sm">{metadata.method}</div>
                                        </div>
                                    )}
                                    {metadata?.phase != null && (
                                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t.phase}</div>
                                            <div className="font-mono tabular-nums font-medium text-slate-600 dark:text-slate-300 text-sm">{formatPair(metadata.phase)}</div>
                                        </div>
                                    )}
                                    {metadata?.origin != null && (
                                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t.origin}</div>
                                            <div className="font-mono tabular-nums font-medium text-slate-600 dark:text-slate-300 text-sm">{formatPair(metadata.origin)}</div>
                                        </div>
                                    )}
                                    {(metadata?.tiles_decoded != null && metadata?.tiles_total != null) && (
                                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t.signalCoverage}</div>
                                            <div className="font-mono tabular-nums font-medium text-slate-600 dark:text-slate-300 text-sm">
                                                {t.signalCoverageValue(metadata.tiles_decoded, metadata.tiles_total)}
                                            </div>
                                        </div>
                                    )}
                                    {metadata?.vote_agreement != null && (
                                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t.voteAgreement}</div>
                                            <div className="font-mono tabular-nums font-medium text-slate-600 dark:text-slate-300 text-sm">
                                                {(metadata.vote_agreement * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    )}
                                    {metadata?.note && (
                                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 col-span-2">
                                            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t.note}</div>
                                            <div className="font-medium text-slate-600 dark:text-slate-300 text-sm">{metadata.note}</div>
                                        </div>
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center bg-slate-100/50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 p-12 text-center min-h-[300px]">
                    <SearchIcon className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600" />
                    <p className="font-medium">{t.readyTitle}</p>
                    <p className="text-sm mt-1 text-slate-400 dark:text-slate-500">{t.readyBody}</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default VerifyTab;
