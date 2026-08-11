#!/usr/bin/env python3
"""Export the 100 keys into a Markdown file grouped by type + duration."""
import json, datetime

d = json.load(open("/home/ubuntu/pro_keys_100.json"))
daily = [k for k in d if k["type"] == "pro" and k["duration_days"] == 1]
weekly = [k for k in d if k["type"] == "pro" and k["duration_days"] == 7]

def row(i, k):
    exp = datetime.datetime.fromisoformat(k["expires_at"].replace("Z", "+00:00"))
    local = exp + datetime.timedelta(hours=1)  # user timezone GMT+1
    return f"| {i} | `{k['key']}` | ✅ | {local.strftime('%Y-%m-%d %H:%M')} |"

lines = []
lines.append("# مفتاحي Pro الشغالة — Free Fire Proxy")
lines.append("")
lines.append("التاريخ المحلي (توقيتك GMT+1). كل مفتاح Pro يعمل مع: Aim Drag، Aim Body، Aim Neck، Speed، 3D Mode، Speed x1.5 عبر `sakura.proxy.rlwy.net:19201`.")
lines.append("")
lines.append("## يومي (1 يوم) — " + str(len(daily)) + " مفتاح")
lines.append("")
lines.append("| # | المفتاح | الحالة | ينتهي في |")
lines.append("|---|---------|--------|----------|")
for i, k in enumerate(daily, 1):
    lines.append(row(i, k))
lines.append("")
lines.append("## أسبوعي (7 أيام) — " + str(len(weekly)) + " مفتاح")
lines.append("")
lines.append("| # | المفتاح | الحالة | ينتهي في |")
lines.append("|---|---------|--------|----------|")
for i, k in enumerate(weekly, 1):
    lines.append(row(i, k))

open("/home/ubuntu/pro_keys_100.md", "w").write("\n".join(lines) + "\n")
print("written", len(daily), "daily +", len(weekly), "weekly")
