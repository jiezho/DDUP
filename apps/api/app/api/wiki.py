from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_current_space, get_current_user_id
from app.core.config import settings
from app.models.space import Space


router = APIRouter(prefix="/wiki", tags=["wiki"])


class WikiStatusOut(BaseModel):
    enabled: bool
    raw_count: int = 0
    raw_latest_updated_at: str | None = None
    manifest_updated_at: str | None = None
    log_updated_at: str | None = None


def _ts(p: Path) -> str:
    dt = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).replace(microsecond=0)
    return dt.isoformat()


@router.get("/status", response_model=WikiStatusOut)
def get_wiki_status(_user_id: str = Depends(get_current_user_id), _space: Space = Depends(get_current_space)):

    if not settings.ddup_wiki_enabled:
        return WikiStatusOut(enabled=False)

    vault_path = settings.ddup_wiki_vault_path.strip()
    if not vault_path:
        raise HTTPException(status_code=500, detail="wiki vault path not configured")

    raw_dir_name = (settings.ddup_wiki_raw_dir or "_raw").strip().strip("/\\")
    vault = Path(vault_path)
    raw_dir = vault / raw_dir_name

    raw_count = 0
    raw_latest: str | None = None
    if raw_dir.exists() and raw_dir.is_dir():
        latest_mtime = 0.0
        for p in raw_dir.glob("*.md"):
            raw_count += 1
            try:
                mtime = p.stat().st_mtime
            except OSError:
                continue
            if mtime > latest_mtime:
                latest_mtime = mtime
                raw_latest = _ts(p)

    manifest_updated: str | None = None
    log_updated: str | None = None
    manifest = vault / ".manifest.json"
    log = vault / "log.md"
    if manifest.exists():
        manifest_updated = _ts(manifest)
    if log.exists():
        log_updated = _ts(log)

    return WikiStatusOut(
        enabled=True,
        raw_count=raw_count,
        raw_latest_updated_at=raw_latest,
        manifest_updated_at=manifest_updated,
        log_updated_at=log_updated,
    )
