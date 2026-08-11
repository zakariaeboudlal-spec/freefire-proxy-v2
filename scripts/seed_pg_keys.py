#!/usr/bin/env python3
"""Seed ff_keys table in Railway Postgres with the 100 keys from pro_keys_100.txt."""
import psycopg2
import re

URL = 'postgresql://postgres:QgovVrBTkDHtNwpzWWJbiUHynwtnRShg@tramway.proxy.rlwy.net:23095/railway?sslmode=require'

lines = open('/home/ubuntu/pro_keys_100.txt').read().splitlines()
rows = []
for line in lines:
    line = line.strip()
    if not line or line.startswith('#') or line.startswith('|'):
        continue
    # lines like "FF-XXXX-XXXX-XXXX | daily | expires 2026-08-12"
    parts = [p.strip() for p in re.split(r'\s*[|–—]\s*', line)]
    key = parts[0].strip().upper()
    if not re.match(r'^FF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$', key):
        continue
    ktype = 'weekly' if 'weekly' in line.lower() else 'daily'
    m = re.search(r'20\d\d-\d\d-\d\d', line)
    expires = m.group(0) if m else None
    rows.append((key, ktype, expires))

con = psycopg2.connect(URL)
cur = con.cursor()
cur.execute('DELETE FROM ff_keys')  # start clean
count = 0
for key, ktype, exp in rows:
    cur.execute('''INSERT INTO ff_keys (key_value, key_type, activated_at, expires_at, device_ip, active, user_id)
                   VALUES (%s, %s, NULL, %s, NULL, FALSE, NULL)
                   ON CONFLICT (key_value) DO UPDATE SET key_type=EXCLUDED.key_type, expires_at=EXCLUDED.expires_at''',
                (key, ktype, exp))
    count += 1
con.commit()
cur.execute('SELECT COUNT(*) FROM ff_keys')
print(f'Seeded {count} keys, table now has {cur.fetchone()[0]} rows')
