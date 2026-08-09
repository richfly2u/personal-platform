#!/usr/bin/env python3
"""一次同步全部 + 複製到 PWA + 推 GitHub Pages"""
import subprocess, sys, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYNC_DIR = os.path.join(ROOT, 'sync')
DATA_DIR = os.path.join(ROOT, 'data')

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

    # 推送到 GitHub Pages
    try:
        r = subprocess.run(['git', '-C', ROOT, 'add', 'data/'],
                           capture_output=True, text=True, timeout=15)
        r = subprocess.run(['git', '-C', ROOT, 'diff', '--cached', '--quiet'],
                           capture_output=True, timeout=15)
        if r.returncode != 0:
            subprocess.run(['git', '-C', ROOT, 'commit', '-m',
                            f'sync: 更新資料 {__import__("time").strftime("%Y-%m-%d %H:%M")}'],
                           capture_output=True, text=True, timeout=15)
            p = subprocess.run(['git', '-C', ROOT, 'push'],
                               capture_output=True, text=True, timeout=60)
            if p.returncode == 0:
                print('\n✅ 已推送 GitHub Pages')
            else:
                print(f'\n⚠️ 推送失敗：{p.stderr[:200]}')
        else:
            print('\n（資料無變更，略過推送）')
    except Exception as e:
        print(f'\n⚠️ git 推送錯誤：{e}')

if __name__ == '__main__':
    main()
