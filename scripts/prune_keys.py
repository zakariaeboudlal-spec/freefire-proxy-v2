#!/usr/bin/env python3
"""Keep exactly 50 pro daily + 50 pro weekly keys (delete newest excess)."""
import json, urllib.request

BASE = "https://freefire-proxy-t4ld.onrender.com"
PW = "ALI7M7"

def api(path, method="GET", data=None):
    tok = json.loads(urllib.request.urlopen(urllib.request.Request(
        BASE + "/api/auth/login",
        data=json.dumps({"password": PW}).encode(),
        headers={"Content-Type": "application/json"})).read())["token"]
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {tok}"},
        method=method)
    return json.loads(urllib.request.urlopen(req).read())

keys = api("/api/keys")
daily = [k for k in keys if k["type"] == "pro" and k["duration_days"] == 1]
weekly = [k for k in keys if k["type"] == "pro" and k["duration_days"] == 7]

for group, keep in [(daily, 50), (weekly, 50)]:
    if len(group) <= keep:
        print(f"{group[0]['duration_days']}-day: {len(group)} (keep)")
        continue
    remove = sorted(group, key=lambda k: k["id"], reverse=True)[:len(group) - keep]
    for k in remove:
        try:
            api(f"/api/keys/{k['id']}", method="DELETE")
        except Exception as e:
            print("fail", k["id"], e)
    print(f"deleted {len(remove)} of {group[0]['duration_days']}-day keys")
