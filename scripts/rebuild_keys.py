#!/usr/bin/env python3
"""Delete ALL keys then create exactly 50 pro daily + 50 pro weekly. Fast path:
batch-create is capped at 50, and deleting one by one is slow, so we overwrite
data/keys.json via the file-system... not accessible remotely; instead we first
delete existing keys in parallel batches using DELETE in a thread pool, then
create the 2 wanted batches."""
import json, urllib.request, concurrent.futures

BASE = "https://freefire-proxy-t4ld.onrender.com"
PW = "ALI7M7"

tok = json.loads(urllib.request.urlopen(urllib.request.Request(
    BASE + "/api/auth/login",
    data=json.dumps({"password": PW}).encode(),
    headers={"Content-Type": "application/json"})).read())["token"]
H = {"Content-Type": "application/json", "Authorization": f"Bearer {tok}"}

def api(path, method="GET", data=None):
    req = urllib.request.Request(BASE + path,
        data=json.dumps(data).encode() if data else None,
        headers=H, method=method)
    return json.loads(urllib.request.urlopen(req).read())

def delete_one(kid):
    try:
        api(f"/api/keys/{kid}", method="DELETE")
        return True
    except Exception:
        return False

# Step 1: delete all existing keys (thread pool for speed)
all_ids = [k["id"] for k in api("/api/keys")]
print(f"deleting {len(all_ids)} keys ...")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    results = list(ex.map(delete_one, all_ids))
print("deleted:", sum(results), "/", len(all_ids))

# Step 2: create 50 daily + 50 weekly
d = api("/api/keys/batch", method="POST", data={"type": "pro", "duration_days": 1, "count": 50})
w = api("/api/keys/batch", method="POST", data={"type": "pro", "duration_days": 7, "count": 50})
print("daily:", len(d["keys"]), "weekly:", len(w["keys"]))

# Step 3: verify
keys = api("/api/keys")
print("total:", len(keys),
      "| daily:", sum(1 for k in keys if k["duration_days"] == 1),
      "| weekly:", sum(1 for k in keys if k["duration_days"] == 7))
