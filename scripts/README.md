# Emelee AIKING — Setup Scripts

Bộ scripts tự động chuyển workflow AIKING (B2B/Tech) sang Emelee Moissanite (B2C trang sức VN) trên N8N.

## Pipeline 3 bước

```
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ n8n-workflows-        │   │ n8n-workflows-       │   │ n8n-workflows-       │
│ original/             │ → │ emelee/              │ → │ emelee-final/        │
│ (6 file JSON gốc)     │   │ (sau replace LI→TT)  │   │ (sau map credentials)│
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
        ↑                          ↑                          ↑
   Bỏ vào tay                Script 1                   Script 2
                       Replace-LinkedinTo...        Map-EmeleeCredentials
```

Sau đó: paste **TikTok branch** snippet vào Publisher Agent → import → chạy.

---

## Script 1 — `Replace-LinkedinToTikTok.ps1`

**Làm gì**: Thay LinkedIn → TikTok trong 6 file workflow JSON (24 patterns + 1 regex fallback).

**Dùng**:
```powershell
cd scripts
.\Replace-LinkedinToTikTok.ps1
# Mặc định đọc n8n-workflows-original/ → ghi n8n-workflows-emelee/
```

**Kết quả test**: 70 replacements ở 6 file, 4 warnings ở Publisher (do anh sửa tay khi đổi credential/API). Chi tiết: xem comment trong script.

**4 warnings cần xử lý tay** (sau khi import vào N8N):
1. `LinkedIn OAuth2 API` credential name
2. `linkedInOAuth2Api` credential type
3. `n8n-nodes-base.linkedIn` node type
4. URL post format `linkedin.com/feed/update/{urn}`

→ Dùng [templates/TikTok-Publisher-Branch.json](templates/TikTok-Publisher-Branch.json) thay 4 chỗ này.

---

## Script 2 — `Map-EmeleeCredentials.ps1`

**Làm gì**: Thay 18 hard-coded credentials/IDs (Telegram chatId, FB Page ID, IG Account ID, FB/IG access tokens, ImgBB key, Google Sheet ID, 4 Drive SKILL file IDs, Drive folder, 4 N8N workflow IDs).

**Setup**:
```powershell
# 1. Copy template → config.json
Copy-Item config.template.json config.json

# 2. Mở config.json bằng Notepad, điền giá trị 'to' cho từng key
#    Field nào để trống sẽ được SKIP an toàn

# 3. Chạy script
.\Map-EmeleeCredentials.ps1
# Mặc định đọc n8n-workflows-emelee/ → ghi n8n-workflows-emelee-final/
```

**Config sections** (xem [config.template.json](config.template.json)):
- `telegram.chat_id`
- `facebook.page_id` + 2 access tokens (Publisher + Analytics)
- `instagram.business_account_id` + 2 access tokens
- `imgbb.api_key`
- `google_sheet.id`
- `google_drive_skill_files` × 4 (orchestrator/research/content/creative)
- `google_drive_image_folder.creative_output_folder_id`
- `n8n_workflow_ids` × 4 (research/content/creative/publisher)

**Workflow 2 lượt**:
- Lượt 1: điền tất cả TRỪ `n8n_workflow_ids` → chạy → import 4 sub-workflow vào N8N → copy ID mới
- Lượt 2: điền `n8n_workflow_ids` → chạy lại → import Marketing Team Agent

**Kết quả test với 7 mapping mẫu**: 50 replacements ở 6 file, JSON valid 100%.

---

## TikTok Branch — `templates/TikTok-Publisher-Branch.json`

**Làm gì**: 3 nodes thay node LinkedIn cũ trong Publisher Agent, dùng TikTok Open API Photo Mode.

Chi tiết setup từ A → Z (đăng ký TikTok Developer, lấy OAuth token, tạo credential N8N, paste nodes, connect): xem [templates/README.md](templates/README.md).

---

## Toàn bộ quy trình setup Emelee AIKING

```
[0] Chuẩn bị (1 ngày)
    - Revoke FB token cũ (EAAkg...)
    - Tạo FB Business System User → token mới có scopes pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish
    - Tạo TikTok Developer App → OAuth → access_token
    - Tạo Telegram bot mới (BotFather) → bot token + chat ID
    - Đăng ký ImgBB → API key
    - Tạo Google Sheet 'Emelee Marketing Log' (5 tabs)
    - Tạo Google Drive folder + upload 4 file SKILL từ skills/emelee-aiking/

[1] Replace LinkedIn → TikTok (5 phút)
    cd scripts
    # Đặt 6 file JSON gốc vào n8n-workflows-original/
    .\Replace-LinkedinToTikTok.ps1

[2] Map credentials/IDs (10 phút điền + 1 phút chạy)
    Copy-Item config.template.json config.json
    notepad config.json    # điền giá trị
    .\Map-EmeleeCredentials.ps1

[3] Import vào N8N (15 phút)
    - Workflows → Import from File → 4 sub-workflows (Research/Content/Creative/Publisher)
    - Copy 4 ID mới từ URL → update config.json (n8n_workflow_ids.*.to)
    - Chạy lại: .\Map-EmeleeCredentials.ps1
    - Import Marketing Team Agent (file đã có ID mới ref)
    - Import Analytics Agent

[4] Setup credentials N8N (10 phút)
    - Tạo: Telegram bot, Google Drive OAuth2, Google Sheets OAuth2, Gemini PaLM, Tavily, Header Auth (TikTok)
    - Vào mỗi node có credential → re-link

[5] Setup TikTok branch (20 phút)
    - Xem templates/README.md
    - Xoá node LinkedIn trong Publisher Agent
    - Paste 3 nodes TikTok snippet
    - Connect + test

[6] Test end-to-end (5 phút)
    Telegram: "nghiên cứu trend moissanite tháng này"
    → Marketing Team gọi Research → trả về báo cáo
    Telegram: "viết bài SRB tự thưởng + tạo ảnh + đăng lên 3 nền tảng"
    → Marketing Team → Content → Creative → Publisher → approval gate
    → Bấm ✅ → FB + IG + TikTok đăng → log Sheet → reply Telegram

[7] Vận hành
    - Mỗi ngày: gửi 2-5 lệnh Telegram
    - Mỗi tuần: chạy Analytics Agent để lấy báo cáo 24h post performance
    - Mỗi 24h: refresh TikTok access_token (workflow N8N riêng)
```

---

## Files trong thư mục này

```
scripts/
├── README.md                              ← bạn đang đọc
├── Replace-LinkedinToTikTok.ps1           ← Script 1
├── Map-EmeleeCredentials.ps1              ← Script 2
├── config.template.json                   ← Template config cho Script 2
├── templates/
│   ├── README.md                          ← Hướng dẫn TikTok branch
│   └── TikTok-Publisher-Branch.json       ← 3 nodes snippet
├── n8n-workflows-original/                ← Đặt 6 file JSON gốc vào đây
│   ├── Marketing Team Agent.json
│   ├── Research Agent.json
│   ├── Content Agent.json
│   ├── Creative Agent.json
│   ├── Publisher Agent.json
│   └── Analytics Agent.json
└── n8n-workflows-emelee/                  ← Output Script 1
    └── (6 file JSON đã LinkedIn→TikTok)
```

---

## Cảnh báo bảo mật quan trọng

1. **Token FB cũ đã bị lộ** trong file workflow gốc. Anh PHẢI revoke ngay tại Facebook Business → System User trước khi setup mới.
2. `config.json` chứa secret (FB token, IG token, ImgBB key, Sheet ID). **KHÔNG commit** file này vào git — đã có `.gitignore` ở root, nhưng verify lại trước khi `git add`.
3. Backup folder `_backup_*` chứa file gốc với token cũ — xoá định kỳ sau khi setup xong.

---

## Encoding note (Windows PowerShell 5.1)

Hai script PowerShell dùng nhiều ký tự tiếng Việt → bắt buộc lưu **UTF-8 BOM**. Nếu chỉnh sửa rồi gặp lỗi parser:

```powershell
$f = ".\Replace-LinkedinToTikTok.ps1"   # hoặc Map-EmeleeCredentials.ps1
$bytes = [System.IO.File]::ReadAllBytes($f)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($f, $content, $utf8Bom)
```
