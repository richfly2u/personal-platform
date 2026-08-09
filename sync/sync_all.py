#!/usr/bin/env python3
"""一次同步全部 + 複製到 PWA"""
import subprocess, sys, os, shutil

SYNC_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SYNC_DIR, '..', 'data')
PWA_DATA = os.path.join(SYNC_DIR, '..', 'pwa', 'data')

SCRIPTS = [
    ('easynote 待辦', 'sync_easynote.py'),
    ('發票載具', 'sync_invoice.py'),
]

def main():
    for name, script in SCRIPTS:
        print(f'\n=== {name} ===')
        result = subprocess.run(
            [sys.executable, os.path.join(SYNC_DIR, script)],
            capture_output=True, text=True, timeout=120,
            cwd=SYNC_DIR
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f'❌ {name} 失敗：{result.stderr}')

    # 複製到 PWA
    os.makedirs(PWA_DATA, exist_ok=True)
    for f in ['invoices.json', 'todos.json']:
        src = os.path.join(DATA_DIR, f)
        dst = os.path.join(PWA_DATA, f)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f'已複製 {f} → pwa/data/')

if __name__ == '__main__':
    main()
