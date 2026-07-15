# InvisiGuard 穩健性基準報告

- seeds: 3
- size: 512x512
- search: phase
- delta: 24.0
- 總耗時: 7.9s

## 影像品質基準（無攻擊，嵌入前後比較）

| delta | 平均 PSNR (dB) | 平均 SSIM |
|---|---|---|
| 24.0 | 42.92 | 0.9899 |

## 攻擊存活率（成功次數 / seeds）

| 攻擊 | 參數 | delta=24.0 |
|---|---|---|
| none | - | 100% (3/3) |
| jpeg | q90 | 100% (3/3) |
| jpeg | q80 | 100% (3/3) |
| jpeg | q70 | 100% (3/3) |
| jpeg | q60 | 100% (3/3) |
| jpeg | q50 | 33% (1/3) |
| resize | 0.75x | 0% (0/3) |
| resize | 0.5x | 0% (0/3) |
| crop-bottom-right | 10% | 100% (3/3) |
| crop-bottom-right | 25% | 100% (3/3) |
| crop-top-left | 128px | 100% (3/3) |
| rotate | 1 deg | 0% (0/3) |
| rotate | 2 deg | 0% (0/3) |
| rotate | 5 deg | 0% (0/3) |
| brightness | +10% | 0% (0/3) |
| brightness | -10% | 0% (0/3) |
| gaussian-blur | sigma=2 | 0% (0/3) |
| gaussian-noise | sigma=2 | 100% (3/3) |
| gaussian-noise | sigma=5 | 100% (3/3) |
