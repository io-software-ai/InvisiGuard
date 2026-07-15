"""
InvisiGuard 浮水印穩健性基準測試 (CLI)。

對一組合成測試影像（漸層 + 雜訊 + 頂部飽和帶，模擬過曝等真實極端區域）執行
嵌入，再對嵌入結果套用一系列攻擊（JPEG 壓縮、縮放、裁切、旋轉、亮度調整、
高斯模糊），統計每種攻擊下的盲提取成功率，並輸出平均 PSNR / SSIM 作為
影像品質基準。結果以 Markdown 表格輸出。

用法範例：
    python benchmark.py
    python benchmark.py --seeds 5 --size 768 --search full --out report.md
    python benchmark.py --delta-sweep "8,12,16,20,24"

注意：resize / 部分 rotate 攻擊在目前演算法（無尺度同步）下預期會盲提取失敗，
這是已知的設計取捨，本腳本如實記錄成功率（含 0%），不代表程式錯誤。
"""

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.core.embedding import WatermarkEmbedder
from src.core.extraction import WatermarkExtractor
from src.core.exceptions import WatermarkNotFoundError, ImageTooSmallError
from src.core.metrics import compute_psnr, compute_ssim
from src.core.attacks import build_attack_matrix
from src.core.params import DELTA

BENCHMARK_TEXT = "InvisiGuard Benchmark"


# ---------------------------------------------------------------------------
# 合成測試影像（獨立於 tests/conftest.py，讓本腳本不依賴 dev 專用套件即可執行）
# ---------------------------------------------------------------------------

def make_synthetic_image(size: int, seed: int) -> np.ndarray:
    """產生 size x size 的合成 BGR 影像：漸層 + 高斯雜訊 + 頂部飽和帶。"""
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 255, size, dtype=np.float64)
    y = np.linspace(0, 255, size, dtype=np.float64)
    gradient = x[None, :] * 0.5 + y[:, None] * 0.5
    noise = rng.normal(0, 15, size=(size, size))
    base = np.clip(gradient + noise, 0, 255)

    b = base
    g = np.roll(base, 10, axis=1)
    r = np.roll(base, -10, axis=0)
    image = np.clip(np.stack([b, g, r], axis=-1), 0, 255).astype(np.uint8)

    band_h = max(1, size // 8)
    image[:band_h, :, :] = 255  # 頂部飽和帶（純白，模擬過曝）
    return image


# PSNR / SSIM 由 src.core.metrics 提供單一實作（service 與本腳本共用，避免公式漂移）。


# 攻擊函式與矩陣由 src.core.attacks 提供（與產品內的穩健性證書共用同一份實作）。


# ---------------------------------------------------------------------------
# 基準測試主流程
# ---------------------------------------------------------------------------

def run_benchmark(seeds: int, size: int, deltas: list, search: str):
    embedder = WatermarkEmbedder()
    extractor = WatermarkExtractor()
    attacks = build_attack_matrix()

    quality_rows = []                       # [(delta, avg_psnr, avg_ssim)]
    attack_results = {}                     # {(group, label): {delta: (successes, total)}}

    for delta in deltas:
        psnrs, ssims = [], []
        watermarked_images = []

        for seed in range(seeds):
            original = make_synthetic_image(size, seed=1000 + seed)
            watermarked = embedder.embed(original, BENCHMARK_TEXT, delta=delta)
            psnrs.append(compute_psnr(original, watermarked))
            ssims.append(compute_ssim(original, watermarked))
            watermarked_images.append(watermarked)

        quality_rows.append((delta, float(np.mean(psnrs)), float(np.mean(ssims))))

        for group, label, attack_fn in attacks:
            successes = 0
            for watermarked in watermarked_images:
                try:
                    attacked = attack_fn(watermarked)
                    result = extractor.extract(attacked, delta=delta, search=search)
                    if result.text == BENCHMARK_TEXT:
                        successes += 1
                except (WatermarkNotFoundError, ImageTooSmallError):
                    # 只把「提取失敗」與「攻擊後影像過小」視為該次攻擊失敗；
                    # 其餘例外（TypeError 等程式錯誤）任其上拋，避免真正的回歸被
                    # 靜默記成 0% 而誤導調參結論。
                    pass
            attack_results.setdefault((group, label), {})[delta] = (successes, seeds)

    return quality_rows, attack_results, attacks


# ---------------------------------------------------------------------------
# Markdown 報告
# ---------------------------------------------------------------------------

def render_markdown(quality_rows, attack_results, attacks, args, elapsed_sec: float) -> str:
    lines = []
    lines.append("# InvisiGuard 穩健性基準報告")
    lines.append("")
    lines.append(f"- seeds: {args.seeds}")
    lines.append(f"- size: {args.size}x{args.size}")
    lines.append(f"- search: {args.search}")
    lines.append(f"- delta: {', '.join(str(d) for d in sorted(quality_rows and [r[0] for r in quality_rows] or []))}")
    lines.append(f"- 總耗時: {elapsed_sec:.1f}s")
    lines.append("")

    lines.append("## 影像品質基準（無攻擊，嵌入前後比較）")
    lines.append("")
    lines.append("| delta | 平均 PSNR (dB) | 平均 SSIM |")
    lines.append("|---|---|---|")
    for delta, psnr, ssim in quality_rows:
        lines.append(f"| {delta} | {psnr:.2f} | {ssim:.4f} |")
    lines.append("")

    deltas = [d for d, _, _ in quality_rows]
    lines.append("## 攻擊存活率（成功次數 / seeds）")
    lines.append("")
    header = "| 攻擊 | 參數 | " + " | ".join(f"delta={d}" for d in deltas) + " |"
    sep = "|---|---|" + "---|" * len(deltas)
    lines.append(header)
    lines.append(sep)
    for group, label, _ in attacks:
        per_delta = attack_results[(group, label)]
        cells = []
        for delta in deltas:
            successes, total = per_delta[delta]
            rate = 100.0 * successes / total if total else 0.0
            cells.append(f"{rate:.0f}% ({successes}/{total})")
        lines.append(f"| {group} | {label} | " + " | ".join(cells) + " |")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="InvisiGuard 浮水印穩健性基準測試",
    )
    parser.add_argument("--seeds", type=int, default=3,
                         help="每個 (攻擊, delta) 組合測試的合成影像數量（預設 3）")
    parser.add_argument("--size", type=int, default=512,
                         help="合成測試影像邊長，正方形 size x size（預設 512）")
    parser.add_argument("--delta-sweep", type=str, default=None,
                         help="逗號分隔的 delta 值列表，例如 '8,12,16,20,24'；"
                              "未指定則只使用 core 預設 DELTA")
    parser.add_argument("--search", type=str, choices=["phase", "full"], default="phase",
                         help="提取時的搜尋模式（預設 phase；full 會顯著拖慢失敗案例的耗時，"
                              "不建議搭配大型攻擊矩陣使用）")
    parser.add_argument("--out", type=str, default="benchmark_report.md",
                         help="Markdown 報告輸出路徑（預設 benchmark_report.md）")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    deltas = (
        [float(x) for x in args.delta_sweep.split(",")]
        if args.delta_sweep
        else [DELTA]
    )

    start = time.time()
    quality_rows, attack_results, attacks = run_benchmark(
        seeds=args.seeds, size=args.size, deltas=deltas, search=args.search,
    )
    elapsed = time.time() - start

    report = render_markdown(quality_rows, attack_results, attacks, args, elapsed)

    out_path = Path(args.out)
    out_path.write_text(report, encoding="utf-8")

    print(report)
    print(f"\n[已寫入] {out_path.resolve()}", file=sys.stderr)


if __name__ == "__main__":
    main()
