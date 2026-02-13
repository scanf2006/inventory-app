# Lube Inventory Tracker (v1.8.1)

A professional, mobile-first inventory management PWA designed for quick stocktaking and PDF reporting.
专为快速盘点和 PDF 报告设计的专业移动端优先库存管理 PWA。

## 🚀 Features / 功能特性

- **Mobile-First Design**: Optimized for touch interaction and quick data entry. / **移动端优先**：针对触摸交互和快速录入进行了优化。
- **Cloud Sync**: Real-time synchronization between devices using Supabase. / **云同步**：使用 Supabase 实现设备间实时同步。
- **PDF Export**: Generate professional, compact A4 reports directly from the browser. / **PDF 导出**：直接在浏览器中生成专业、紧凑的 A4 报告。
- **Safe Math Input**: Supports basic math expressions (e.g., `10 + 5 * 2`) with security protection. / **安全数学输入**：支持基础数学表达式（如 `10 + 5 * 2`），并提供安全保护。
- **Non-blocking UI**: Modern Toast notifications and custom modals replacing native alerts. / **非阻塞 UI**：现代 Toast 通知和自定义模态框替代原生弹窗。
- **Offline Capable**: Full PWA support with Service Worker caching. / **离线支持**：全功能 PWA 支持，具备 Service Worker 缓存。

## 🛠️ Tech Stack / 技术栈

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Backend (BaaS)**: Supabase (PostgreSQL)
- **PDF Engine**: `html2pdf.js` (html2canvas + jsPDF)
- **Icons**: Emoji & Custom SVG assets

## 📦 Installation / 安装指南

This application is a static web app. You can host it on any static file server.
本应用为静态网页应用，可部署在任何静态文件服务器上。

### Local Development / 本地开发
1. Clone the repository. / 克隆仓库。
2. Serve the directory using a local server (e.g., Python or Node.js). / 使用本地服务器（如 Python 或 Node.js）运行目录。
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (http-server)
   npx http-server .
   ```
3. Open `http://localhost:8000` in your browser. / 在浏览器打开 `http://localhost:8000`。

## 🔒 Security / 安全性

- **Safe Eval**: v1.8.0 introduced `SafeMathParser` to prevent code execution in input fields. / v1.8.0 引入了 `SafeMathParser` 防止输入框代码执行。
- **Input Debounce**: Storage writes are debounced to prevent performance degradation and excessive I/O. / **输入防抖**：存储写入经过防抖处理，防止性能下降和过多 I/O。

## 📄 License

MIT License.
