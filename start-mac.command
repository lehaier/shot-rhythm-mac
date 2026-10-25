#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

pause() {
  printf '\n按回车键关闭此窗口...'
  read -r _
}

if ! command -v node >/dev/null 2>&1; then
  echo '未找到 Node.js。请先安装 Node.js 20 或更高版本，参见 README-MAC.md。'
  pause
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo '未找到 FFmpeg 或 ffprobe。请先安装 FFmpeg，参见 README-MAC.md。'
  pause
  exit 1
fi

if curl --silent --fail --max-time 2 http://127.0.0.1:4317/ >/dev/null; then
  echo '本地网页服务已在运行。'
  open 'http://127.0.0.1:4317/'
  pause
  exit 0
fi

node server.js &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

for ((attempt=0; attempt<50; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    echo '服务启动失败。'
    pause
    exit 1
  fi
  if curl --silent --fail --max-time 1 http://127.0.0.1:4317/ >/dev/null; then
    echo '浏览器将打开 http://127.0.0.1:4317/。使用期间请保持此窗口打开。'
    open 'http://127.0.0.1:4317/'
    wait "$server_pid"
    exit $?
  fi
  sleep 0.1
done

echo '服务启动超时。'
pause
exit 1
