# TikTok Publisher Branch — Integration Guide

3 nodes thay thế node LinkedIn "Create a post" trong Publisher Agent, dùng TikTok Open API Photo Mode.

## File

- **[TikTok-Publisher-Branch.json](TikTok-Publisher-Branch.json)** — snippet 3 nodes (Init / Wait / Status Check) + connection map + Sheet logging update.

## Tại sao Photo Mode?

Workflow Creative Agent hiện sinh **ảnh tĩnh** (Gemini Nano Banana Pro), không phải video. TikTok Open API có 3 chế độ post:
- `VIDEO` — cần file mp4
- `PHOTO` — image carousel (1-35 ảnh) ← **đang dùng**
- `INBOX` — gửi vào hộp draft của user

Photo Mode phù hợp Emelee vì ảnh sản phẩm + scene moodboard từ Creative Agent.

> Sau này nếu muốn dùng VIDEO, thay `media_type: PHOTO` thành `VIDEO` + `photo_images` thành `video_url`.

## Setup từ A → Z

### Bước 1 — Đăng ký TikTok Developer

1. Vào https://developers.tiktok.com/apps
2. **Create app** → chọn product **Content Posting API**
3. Settings → Scopes → bật:
   - `video.publish`
   - `video.upload`
   - `user.info.basic`
4. Settings → Login Kit → Add Redirect URI:
   - Sandbox: `https://localhost/callback`
   - Production: domain anh dùng
5. Đợi TikTok approve (1-3 ngày work với personal app, instant với Business).

### Bước 2 — Lấy Access Token

OAuth flow:
1. Mở: `https://www.tiktok.com/v2/auth/authorize/?client_key={CLIENT_KEY}&scope=video.publish,video.upload,user.info.basic&response_type=code&redirect_uri={REDIRECT_URI}&state=emelee`
2. Login bằng TikTok account Emelee → cấp quyền → bị redirect kèm `?code=XXX`
3. Đổi code → access_token:
   ```bash
   curl -X POST 'https://open.tiktokapis.com/v2/oauth/token/' \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d 'client_key=YOUR_CLIENT_KEY&client_secret=YOUR_SECRET&code=XXX&grant_type=authorization_code&redirect_uri=YOUR_REDIRECT'
   ```
4. Response: `{ "access_token": "act.xxx", "refresh_token": "rft.xxx", "expires_in": 86400 }`
5. Lưu `access_token` (sống 24h, dùng `refresh_token` để gia hạn)

### Bước 3 — Tạo credential N8N

1. N8N → Settings → Credentials → **+ Add Credential** → tìm **Header Auth**
2. Điền:
   - **Name**: `TikTok Open API`
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer act.xxx...` (paste access token bước 2)
3. Save → ghi nhớ credential ID (URL ở dạng `/credentials/XXXXXX`)

### Bước 4 — Import 3 nodes vào Publisher Agent

#### Cách A — Copy/Paste JSON snippet (khuyên dùng)

1. Mở Publisher Agent trong N8N → tab editor
2. **Xoá** node cũ: `Create a post` (LinkedIn — node ID `8ab558d1-65e2-45d6-86c0-9dd72eedcf6b`)
3. **Xoá** node `HTTP Request` ngay trước nó (node ID `f60fe8b9-8273-4866-a590-883b0f6cf667`) — không cần với TikTok PULL_FROM_URL
4. Mở [TikTok-Publisher-Branch.json](TikTok-Publisher-Branch.json) → copy đoạn `nodes` array (3 nodes)
5. Trong N8N editor: **Ctrl+V** trên canvas → 3 nodes xuất hiện
6. Trong từng node: click vào credential → chọn `TikTok Open API` (vừa tạo bước 3)

#### Cách B — Import workflow rồi cherry-pick

1. N8N → Workflows → **Import from File** → chọn `TikTok-Publisher-Branch.json`
2. Mở workflow vừa import → copy 3 nodes (Ctrl+A → Ctrl+C)
3. Mở Publisher Agent → paste (Ctrl+V)
4. Xoá workflow tạm

### Bước 5 — Connect nodes

Vẽ 3 đường:
```
Telegram - Đợi duyệt2 → (approve branch) → TikTok Init Post
TikTok Init Post     →                    → TikTok Wait Process
TikTok Wait Process  →                    → TikTok Check Status
TikTok Check Status  →                    → Cập nhật Sheet Analytics4
```

### Bước 6 — Update Sheet logging expression

Trong node `Cập nhật Sheet Analytics4` và `Cập nhật Sheet Analytics5`, tìm column `TikTok` và update expression:

```
={{ $('TikTok Check Status').item.json.data.status === 'PUBLISH_COMPLETE' 
  ? ('https://www.tiktok.com/@YOUR_USERNAME/video/' + $('TikTok Check Status').item.json.data.publicaly_available_post_id) 
  : ('PROCESSING - publish_id: ' + $('TikTok Init Post').item.json.data.publish_id) }}
```

Thay `YOUR_USERNAME` bằng tên TikTok Emelee (vd `@emelee.jewelry`).

## Lưu ý vận hành

| Vấn đề | Giải pháp |
|--------|-----------|
| Access token hết hạn 24h | Dùng `refresh_token` để gia hạn — viết workflow N8N riêng chạy daily 8am |
| Ảnh phải public URL | Google Drive `webContentLink` đôi khi bị 302 redirect → upload qua ImgBB trước (như IG) |
| Status PROCESSING quá lâu | Tăng Wait từ 8s → 15s, hoặc loop check status 3 lần |
| Rate limit | Sandbox: 6 post/ngày/user. Production: 100 post/ngày. Thêm node IF kiểm tra quota |
| TikTok reject nội dung | Caption không được có link external (tiktok.com policy), URL ảnh phải HTTPS |
| Auto music | `auto_add_music: true` → TikTok tự gắn nhạc trending phù hợp |

## Test workflow

Sau khi setup xong, test bằng Telegram:

```
@MarketingAgentBot
Đăng bài SRT lên TikTok với hook "Tự thưởng sau thăng chức"
```

Marketing Team Agent → gọi Content Agent → gọi Creative Agent → gọi Publisher Agent → approval gate Telegram → bấm ✅ Duyệt → TikTok Init Post chạy → Wait 8s → Check Status → log Sheet → reply Telegram "Đã đăng".

Kiểm tra TikTok app: bài đăng xuất hiện ở profile Emelee.

## Nếu gặp lỗi

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| 401 Unauthorized | Token sai hoặc hết hạn | Tạo lại token, update credential |
| 403 invalid_scope | Thiếu scope `video.publish` | Re-OAuth với scope đúng |
| 400 invalid_param | Image URL không public hoặc không phải JPEG/PNG | Upload qua ImgBB trước |
| spam_risk_user_banned_from_posting | TikTok ban tạm thời | Đợi 24h, giảm tần suất |
| Image > 20MB | Ảnh quá lớn | Resize trong Creative Agent (Sharp/Pillow) |
