#!/usr/bin/env python3
"""检查拟公开文件；完整密钥扫描由 CI 中的 gitleaks 执行。"""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
paths = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT).decode().split("\0")
errors = []
patterns = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    re.compile(r"\bAKIA[A-Z0-9]{16}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{32,}\b"),
]
for name in sorted(set(paths) - {""}):
    path = ROOT / name
    if not path.is_file():
        continue
    if (path.name.startswith(".env") and path.name != ".env.example") or path.suffix in {".db", ".sqlite", ".libsql", ".pem", ".key"} or name.startswith((".vercel/", "data/", "exports/", "screenshots/")):
        errors.append(f"禁止公开本地配置或数据：{name}")
    content = path.read_text(errors="replace")
    if any(pattern.search(content) for pattern in patterns):
        errors.append(f"疑似密钥：{name}（内容已隐藏）")
    if name == "package-lock.json" and "npmmirror" in content:
        errors.append("锁文件中不得使用 npmmirror")
if errors:
    sys.stderr.write("\n".join(errors) + "\n")
    sys.exit(1)
print("公开文件检查通过。")
