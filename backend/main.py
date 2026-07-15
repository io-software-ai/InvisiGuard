from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from src.api.routes import router as api_router
from src.core import params
from src.utils.logger import setup_logging, get_logger

# Setup logging with DEBUG level for detailed diagnostics
setup_logging("DEBUG")
logger = get_logger(__name__)

# 啟動安全檢查：未設定 WATERMARK_KEY 時，浮水印會以公開的 DEMO 金鑰嵌入，
# 任何人皆可讀取 / 偽造 / 抹除。正式部署務必設定環境變數。
if params.is_using_default_key():
    logger.warning(
        "[SECURITY] WATERMARK_KEY 未設定，正在使用公開的 DEMO 金鑰 "
        "(params.DEFAULT_KEY)。此模式下浮水印可被任何人偽造或抹除，"
        "切勿用於正式環境。請設定環境變數 WATERMARK_KEY。"
    )

app = FastAPI(
    title="InvisiGuard API",
    description="Invisible Watermarking & Geometric Correction API",
    version="1.0.0"
)

# CORS
# 允許的來源改由環境變數 CORS_ORIGINS 設定（逗號分隔），預設僅開放本地開發前端。
# 注意：allow_origins=["*"] 搭配 allow_credentials=True 依規範會被瀏覽器忽略且不安全，
# 因此改為白名單來源，並將 allow_credentials 設為 False（目前 API 不依賴 cookie/憑證）。
_default_cors_origins = "http://localhost:5173,http://127.0.0.1:5173"
cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", _default_cors_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for processed images
os.makedirs("static/processed", exist_ok=True)
os.makedirs("static/debug", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(api_router, prefix="/v1")
# 同一組路由也掛在 /api/v1：前端 axios baseURL 為 /api/v1，如此前後端可「同源」部署，
# 不必額外反向代理改寫 /api -> /v1（本地開發仍走 Vite proxy，不受影響）。
app.include_router(api_router, prefix="/api/v1")

# 選用：由後端「同源」提供前端 Vite 建置檔。設定 FRONTEND_DIST 指向 dist 目錄即啟用；
# 未設定或目錄不存在（本地開發）時維持原本的 JSON 根路由。前端採 hash 路由，靜態提供
# index.html 即足夠。此掛載務必放在最後，避免蓋掉 /v1、/api/v1、/static。
_frontend_dist = os.environ.get("FRONTEND_DIST", "").strip()
if _frontend_dist and os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
else:
    @app.get("/")
    async def root():
        return {"message": "InvisiGuard API is running"}

if __name__ == "__main__":
    import uvicorn
    # 本地開發預設 8000 + reload；部署（Zeabur 等）以 PORT / WEB_PORT 覆寫、RELOAD=0 關閉熱重載。
    # 用 Python 讀環境變數（而非 CLI 的 ${PORT} 展開），避免平台以非 shell 方式執行
    # 啟動指令時變數不展開、uvicorn 收到字面字串 "${WEB_PORT}" 而崩潰的問題。
    port = int(os.environ.get("PORT") or os.environ.get("WEB_PORT") or "8000")
    reload = os.environ.get("RELOAD", "1") != "0"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)
