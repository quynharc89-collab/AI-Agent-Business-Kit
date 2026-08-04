# Extra N8N Workflows for Emelee

Workflow phụ trợ cho vận hành Emelee AIKING ổn định.

## TikTok-Token-Refresh.json

**Mục đích:** Tự động gia hạn TikTok access token mỗi 23h (token TikTok Open API hết hạn 24h).

**Mechanism:** Cron 23h → POST `/v2/oauth/token/` với `grant_type=refresh_token` → parse new token → PATCH credential N8N qua REST API → Telegram báo cáo.

### Setup

#### 1. Lấy 3 giá trị TikTok OAuth từ Developer Portal
- `TIKTOK_CLIENT_KEY` — Settings → App Info → Client Key
- `TIKTOK_CLIENT_SECRET` — Settings → App Info → Client Secret  
- `TIKTOK_REFRESH_TOKEN` — từ OAuth flow lần đầu (response của `/v2/oauth/token/` với `grant_type=authorization_code`)

#### 2. Set environment variables cho N8N
Trong file `.env` của N8N hoặc docker-compose:
```bash
TIKTOK_CLIENT_KEY=xxx
TIKTOK_CLIENT_SECRET=xxx
TIKTOK_REFRESH_TOKEN=rft.xxxxxxxxxxxx
N8N_API_KEY=xxx                  # Settings -> API -> Create Key
TELEGRAM_CHAT_ID=8743334949      # Chat ID của anh
```

Restart N8N container/service.

#### 3. Lấy N8N internal IDs cần thay
Mở workflow đã có credential TikTok Open API:
- `TIKTOK_CRED_ID` = ID của credential (URL `/credentials/XXXX`)
- `REPLACE_TELEGRAM_CRED_ID` = ID của Telegram credential

#### 4. Import workflow
1. N8N → Workflows → Import from File → `TikTok-Token-Refresh.json`
2. Trong node `Update TikTok Credential`:
   - URL: `https://YOUR_N8N_HOST/api/v1/credentials/TIKTOK_CRED_ID`
   - Thay `YOUR_N8N_HOST` bằng domain N8N của anh
   - Thay `TIKTOK_CRED_ID` bằng ID thật
3. Trong node `Notify Success` → credentials → chọn Telegram Emelee
4. **Activate workflow** (toggle góc trên phải)

### Caveat quan trọng

TikTok rotate `refresh_token` mỗi lần refresh:
- Lần 1: refresh_token A → mới ra refresh_token B (A invalid ngay)
- Lần 2: phải dùng B → ra refresh_token C
- ...

→ Nếu env var `TIKTOK_REFRESH_TOKEN` không tự update, workflow sẽ fail sau 1 lần chạy.

**Solutions:**

| Cách | Phức tạp | Ổn định |
|------|----------|---------|
| **A. Update env tay** sau mỗi refresh (đọc Telegram → vào server → edit .env → restart N8N) | Cao | Cao |
| **B. Lưu refresh_token vào Google Sheet** + đọc/ghi qua node Sheets thay vì env | Trung bình | Cao |
| **C. Dùng Static N8N database** (PostgreSQL custom table) | Cao | Cao nhất |
| **D. Disable refresh, OAuth lại tay mỗi tuần** | Thấp | Thấp |

→ **Em đề xuất B** cho Emelee: tạo 1 row trong Sheet `Emelee Marketing Log` tab `_secrets` (hidden tab) lưu refresh_token current. Workflow đọc từ Sheet thay vì env.

#### Modification để dùng cách B
1. Tạo tab mới `_secrets` trong Sheet (ẩn đi sau khi setup)
2. Cột A1=`key`, B1=`value`, A2=`tiktok_refresh_token`, B2=`rft.xxxx` (token đầu)
3. Trong `TikTok-Token-Refresh.json`:
   - Add node **Google Sheets** đầu workflow: read A2:B2 → field `current_refresh_token`
   - Trong node `Refresh TikTok Token`: dùng `{{ $('Sheets Read').item.json.value }}` thay cho `$env.TIKTOK_REFRESH_TOKEN`
   - Sau `Parse & Validate`: add node **Google Sheets** update A2:B2 với `new_refresh_token`

> Em chưa wire sẵn cách B vì cần Sheet ID + auth — anh setup xong Sheet thì em wire tiếp.

### Test thủ công

Trước khi để cron chạy, click **Execute Workflow** trong N8N để test:
1. Refresh Token call ra `access_token` mới
2. Parse OK
3. PATCH credential thành công (status 200)
4. Telegram message arrive

Verify trong N8N: vào credential `TikTok Open API` → Header value đã đổi.

### Failure modes & cách xử lý

| Error | Nguyên nhân | Fix |
|-------|-------------|-----|
| `invalid_grant` | Refresh token đã expire (90 ngày) hoặc rotated mất | Re-OAuth tay → update env/Sheet |
| `invalid_client` | Client key/secret sai | Check Developer Portal |
| 401 từ N8N API | API key sai | Regenerate trong N8N Settings → API |
| 404 credential not found | TIKTOK_CRED_ID sai | Xem URL credential thật |
| Token gia hạn nhưng workflow Publisher vẫn 401 | Cache N8N — restart credential connection | Mở Publisher → click credential → save lại |

### Logs

Mỗi lần workflow chạy thành công, log row vào Sheet `_secrets` (column C `last_refreshed_at`) hoặc dùng tab riêng `_token_log`. Để track 30 ngày qua xem có miss refresh nào không.
