from pydantic_settings import BaseSettings
from pathlib import Path
import os

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent

class Settings(BaseSettings):
    groq_api_key: str = ""
    database_url: str = f"sqlite:///{(_BACKEND_DIR / 'smartlogparser.db').as_posix()}"
    max_upload_size_mb: int = 20
    upload_dir: str = str(_BACKEND_DIR / "uploads")
    allowed_extensions: set[str] = {".json", ".xml", ".csv", ".log", ".txt", ".kv", ".hex", ".bin"}
    llm_model: str = "llama-3.3-70b-versatile"
    llm_batch_size: int = 25

    model_config = {"env_file": str(_PROJECT_ROOT / ".env")}

settings = Settings()
