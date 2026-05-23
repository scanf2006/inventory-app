# Inventory App Requirements Baseline

## Product Goal
A mobile-first inventory management PWA for fast stocktaking, cloud sync across devices, and exportable PDF reports.

## Core Requirements
- Mobile-first inventory input and quick editing workflow.
- Cloud synchronization between devices (Supabase-based).
- Desktop dashboard for category view, charting, and live ticker display.
- PDF report export from browser.
- JSON import/export backup support.
- Offline-capable PWA behavior with cache support.

## Functional Requirements
1. Inventory Data
- Manage categories and products.
- Edit per-product inventory value with safe expression input.
- Track inventory update timestamp based on actual inventory actions.

2. Synchronization
- Sync via shared sync ID.
- Manual force-sync entry point.
- Last-write-wins merge behavior for now.

3. Reporting
- Export A4 PDF report.
- Show `Report Date` and `Last Updated` in report header.
- Hide zero-inventory products in PDF report.

4. Live Messaging
- Send/receive live ticker messages across devices.
- Keep message timestamp display in ticker/history.

## Non-Functional Requirements
- Safe math parser for input security.
- Non-blocking UI feedback (toast/modal instead of native alert).
- Maintainable modular JS structure.

## Current Open Items
- Continue monitoring desktop sync freshness visibility.
- Evaluate stronger realtime strategy if auto-sync reliability is insufficient.
- Improve conflict handling beyond basic last-write-wins when needed.

## Source Documents
- `README.md`
- `task.md`
- `implementation_plan.md`
