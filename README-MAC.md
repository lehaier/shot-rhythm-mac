# 镜头节奏 — macOS 版

这是本地网页应用：分析程序在你的 Mac 上运行，网页通过 `http://127.0.0.1:4317/` 与它通信。`127.0.0.1` 在 Mac 上同样表示这台设备自己，与 Windows 上的含义相同。

## 第一次使用

1. 在 Mac 上安装 [Node.js](https://nodejs.org/en/download) 20 或更高版本，以及 [FFmpeg](https://ffmpeg.org/download.html)（需要同时包含 `ffmpeg` 和 `ffprobe`）。若使用 Homebrew，也可在终端运行 `brew install node ffmpeg`。
2. 解压整个压缩包，保留 `public` 文件夹和其他文件的相对位置。
3. 双击 `start-mac.command`。它会检查依赖、启动本地服务，并打开浏览器。**使用期间保持弹出的终端窗口打开。**

如果 macOS 提示脚本没有执行权限，在解压后的项目文件夹打开终端并运行一次：

```bash
chmod +x start-mac.command
./start-mac.command
```

也可以不改权限，直接在该文件夹的终端运行 `bash start-mac.command`。

## 使用与限制

选择视频后，应用会在 Mac 的临时目录中保存一份用于 FFmpeg 分析，完成后删除临时文件。视频不会发送到互联网服务器。可以校正剪切点，导出 SVG、PNG 和 CSV。

如果浏览器提示无法连接，请重新运行 `start-mac.command`，再在页面点击“重试分析”。部分编码格式可能无法在浏览器中预览，但 FFmpeg 仍可能分析成功；此时可以用秒数手动校正切点。

当前包不包含 Node.js、FFmpeg，也不是独立 `.app` 安装包。核心代码与 Windows 版相同；此版本的 Mac 启动流程尚未在真实 Mac 设备上测试。
