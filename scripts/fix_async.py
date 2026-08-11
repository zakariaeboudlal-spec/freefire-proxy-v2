#!/usr/bin/env python3
import re

for path in ["src/routes/keys.ts", "src/routes/stats.ts"]:
    s = open(path).read()
    # fix "(async (req, res) => {" (double open paren) -> "async (req, res) => {"
    s = s.replace("(async (req, res) => {", "async (req, res) => {")
    # make remaining sync handlers async
    s = re.sub(r"router\.(get|post)\(\"([^\"]+)\",\s*((?:authMiddleware,\s*)?(?!async))\(req, res\) => \{",
               lambda m: m.group(0).replace("(req, res) => {", "async (req, res) => {"), s)
    open(path, "w").write(s)
    print(f"fixed {path}")

# also check stats.ts keys handling
s = open("src/routes/stats.ts").read()
print(s[:800])
