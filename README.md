# Lube Inventory Tracker (v1.8.1)

A professional, mobile-first inventory management PWA designed for quick stocktaking and PDF reporting.

## Features

- **Mobile-First Design**: Optimized for touch interaction and quick data entry.
- **Cloud Sync**: Real-time synchronization between devices using Supabase.
- **PDF Export**: Generate professional, compact A4 reports directly from the browser.
- **Safe Math Input**: Supports basic math expressions (e.g., `10 + 5 * 2`) with security protection.
- **Non-blocking UI**: Modern Toast notifications and custom modals replacing native alerts.
- **Offline Capable**: Full PWA support with Service Worker caching.

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Backend (BaaS)**: Supabase (PostgreSQL)
- **PDF Engine**: `html2pdf.js` (html2canvas + jsPDF)
- **Icons**: Emoji and custom SVG assets

## Installation

This application is a static web app. You can host it on any static file server.

### Local Development

1. Clone the repository.
2. Serve the directory using a local server (for example, Python or Node.js).

```bash
# Python 3
python -m http.server 8000

# Node.js (http-server)
npx http-server .
```

3. Open `http://localhost:8000` in your browser.

### Release Helper

- Patch bump (updates `package.json`, `src/app-config.js`, `index.html`, `sw.js`):

```bash
npm run release:patch
```

## Security

- **Safe Eval**: v1.8.0 introduced `SafeMathParser` to prevent code execution in input fields.
- **Input Debounce**: Storage writes are debounced to prevent performance degradation and excessive I/O.

## License

MIT License.
