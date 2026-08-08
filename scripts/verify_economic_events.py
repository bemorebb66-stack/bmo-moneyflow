"""Daily structural verification for the official economic release schedule."""
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlparse

path = Path(__file__).resolve().parents[1] / "economic_events.json"
payload = json.loads(path.read_text(encoding="utf-8"))
events = payload.get("events") or []
if not events:
    raise SystemExit("economic schedule is empty")
allowed_hosts = {"www.federalreserve.gov", "www.bls.gov", "www.bea.gov"}
for event in events:
    datetime.strptime(event["date"], "%Y-%m-%d")
    if urlparse(event.get("sourceUrl", "")).hostname not in allowed_hosts:
        raise SystemExit(f"unapproved economic source: {event.get('sourceUrl')}")
payload.setdefault("meta", {})["checkedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
payload["meta"]["check"] = "Official-source URLs and event schema verified; schedule dates remain source-controlled."
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"verified {len(events)} economic events")
