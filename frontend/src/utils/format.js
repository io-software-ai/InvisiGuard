/**
 * Shared presentation helpers: confidence-tier coloring and plain-language
 * translations for technical quality metrics (PSNR/SSIM).
 */

/**
 * Classify a 0..1 confidence score into a visual tier.
 * <50% rose (low) / 50-80% amber (mid) / >80% emerald (high)
 * @param {number} confidence - 0..1 confidence score
 * @returns {{pct: number, level: 'low'|'mid'|'high', textClass: string}}
 */
export function getConfidenceTier(confidence) {
    const pct = Math.round((confidence ?? 0) * 100)
    if (pct < 50) {
        return { pct, level: 'low', textClass: 'text-rose-600' }
    }
    if (pct <= 80) {
        return { pct, level: 'mid', textClass: 'text-amber-600' }
    }
    return { pct, level: 'high', textClass: 'text-emerald-600' }
}

/**
 * Plain-language translation of a PSNR value (dB). Higher is better.
 * @param {number} psnr
 * @param {'en'|'zh'} lang
 * @returns {string}
 */
export function describePsnr(psnr, lang = 'en') {
    if (psnr == null || Number.isNaN(psnr)) return ''
    const zh = psnr >= 40 ? '肉眼幾乎看不出差異' : psnr >= 30 ? '一般情境下差異不易察覺' : '可能有些微可見差異'
    const en = psnr >= 40 ? 'Virtually indistinguishable to the eye'
        : psnr >= 30 ? 'Differences are hard to notice in normal use'
        : 'Slight visible differences possible'
    return lang === 'zh' ? zh : en
}

/**
 * Plain-language translation of an SSIM value (0..1). Higher is better.
 * @param {number} ssim
 * @param {'en'|'zh'} lang
 * @returns {string}
 */
export function describeSsim(ssim, lang = 'en') {
    if (ssim == null || Number.isNaN(ssim)) return ''
    const zh = ssim >= 0.98 ? '結構幾乎完全一致' : ssim >= 0.9 ? '結構高度相似' : '結構有可察覺的變化'
    const en = ssim >= 0.98 ? 'Structure is nearly identical'
        : ssim >= 0.9 ? 'Structure is highly similar'
        : 'Noticeable structural change'
    return lang === 'zh' ? zh : en
}
