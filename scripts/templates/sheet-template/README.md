# Emelee Marketing Log — Sheet Template

5 file CSV — mỗi file là 1 tab trong Google Sheet "Emelee Marketing Log".

## Cách tạo Sheet

### Bước 1 — Tạo Sheet mới
1. Drive → New → Google Sheets → đặt tên: **`Emelee Marketing Log`**
2. Copy Sheet ID từ URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit` → paste vào `config.json` (key `google_sheet.id.to`)

### Bước 2 — Tạo 5 tab và import CSV
Trong Sheet vừa tạo:

| Tab name | File import | Ghi chú |
|----------|-------------|---------|
| `Sheet research` | `01-Sheet research.csv` | Tab #1 (gid=0) — đã có sẵn khi tạo Sheet, rename |
| `Sheet content` | `02-Sheet content.csv` | + tab mới |
| `Sheet creative` | `03-Sheet creative.csv` | + tab mới |
| `Sheet publisher` | `04-Sheet publisher.csv` | + tab mới |
| `Sheet analytics` | `05-Sheet analytics.csv` | + tab mới |

Cho từng tab:
1. Click **+ Thêm trang tính** → rename theo bảng trên
2. File → Import → Upload → chọn CSV tương ứng
3. **Import location**: "Replace current sheet"
4. **Separator**: Comma
5. ✅ "Convert text to numbers" (cho cột Like/Comment/Score)

### Bước 3 — Xoá 2 dòng sample (sau khi verify columns đúng)
Mỗi tab có 1-2 dòng REQ-100X sample. Xoá đi khi xong test.

## Schema mỗi tab

### `Sheet research` (8 cột)
Log mỗi lần Research Agent chạy.

| Cột | Kiểu | Ý nghĩa |
|-----|------|---------|
| ID Yêu cầu | string | REQ-{telegram_message_id} |
| Thời gian | datetime | dd/MM/yyyy HH:mm |
| Nội dung yêu cầu gốc từ Telegram | string | Text message chị gửi |
| Chủ đề | string | Query parameter |
| Agent thực thi | enum | `research` |
| Kết quả Research | text | Markdown báo cáo của Research Agent |
| Thông tin trích xuất | string | N/A (chưa dùng) |
| Trạng thái | enum | `Hoàn thành` / `Đang xử lý` / `Lỗi` |

### `Sheet content` (13 cột)
Log mỗi lần Content Agent generate caption.

**Đã thêm 2 cột Emelee-specific:** SKU + Cấp phễu

| Cột Emelee mới | Giá trị |
|----------------|---------|
| SKU | SRT / SRB / ET-01 / BE-01 / BT-02 / DC-01 / VT-01 / NH-05 / NH-OV / NH-CU |
| Cấp phễu | Cấp 1 (free) / Cấp 2 (300K-900K) / Cấp 3 (1.499-1.799K) / Cấp 4 (2M-5M) / Cấp 5 (5M-15M) |

### `Sheet creative` (11 cột)
Log ảnh AI generated.

Cột FaceBook / Instagram / TikTok = Drive webContentLink của ảnh.

### `Sheet publisher` (15 cột)
Log mỗi lần đăng bài + URL post thật.

**Đã thêm cột Emelee mới: CTA Type**
Giá trị enum:
- `Inbox XỨNG ĐÁNG` (mặc định)
- `Inbox tư vấn`
- `Link Zalo OA`
- `Comment giá`
- `Phone call`
- `Free GRA check`

### `Sheet analytics` (22 cột)
Log báo cáo 24h sau đăng — input cho Analytics Agent.

**Đã thêm 4 cột phân tích sâu:**
- `Save` (IG/TikTok save count — quan trọng hơn like)
- `Engagement Score` (công thức Emelee: `(Like + Comment*3 + Share*5 + Save*4) / Views * 1000`)
- `Phân loại` (🔥 Viral / ✅ Good / ⚠️ Average / ❌ Underperform)
- `Hook used` (1 trong 7 templates — để track hook nào hiệu quả nhất)

## Cập nhật workflow N8N để khớp schema

Sau khi tạo Sheet xong, anh phải sửa các node **Google Sheets** trong 5 workflow để khớp cột mới (SKU, Cấp phễu, CTA Type, Save, Engagement Score, ...). Trong từng node:

1. Click node → Settings → "Refresh schema"
2. Map field từ AI output → cột mới
3. Cho Content Agent prompt: bảo nó trả thêm field `sku` và `cấp phễu` trong output JSON
4. Cho Analytics Agent: dùng SKILL `analytics_v2.0.md` mới — đã có formula Engagement Score

> Em không tự sửa workflow JSON vì cột mới cần adjust mapping per-node trong N8N UI dễ hơn.

## Sample data

Mỗi CSV có 1-2 dòng sample (REQ-1001, REQ-1002, ...). Đây chỉ để illustrate format — **xoá sau khi import** vì N8N sẽ append row mới mỗi lần chạy workflow.
