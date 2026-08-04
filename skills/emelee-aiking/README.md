# Emelee AIKING — 5 SKILL Files

5 file system prompt cho hệ multi-agent N8N (AIKING) đã được Emelee hoá.
Mỗi file thay thế file gốc trong workflow `Workflow AI AIGent` (Analytics SKILL là file mới — AIKING gốc không có file SKILL riêng cho Analytics).

## Mapping file → workflow

| File này | Thay thế file Drive cũ | Dùng trong workflow N8N |
|----------|-------------------------|-------------------------|
| `orchestrator_v2.0.md` | `orchestrator_v2.0.md` (Drive ID `1RqOGOY3llPd498KxRKx6zxEIydNn8Jx9`) | Marketing Team Agent |
| `research_v2.0.md` | `research_v2.0.md` (Drive ID `1l6FTCpnackF_1Usz7OArwOFcg1VGtI52`) | Research Agent |
| `content_v2.0.md` | `content_v2.0.md` (Drive ID `1rxcVjf1kAsJybYP17duuI3RWosb0iq1_`) | Content Agent |
| `creative_v2.0.md` | `creative_v2.0.md` (Drive ID `1PM5i6PVcGhtAKHPTiHF5_URFsBI8D01-`) | Creative Agent |
| `analytics_v2.0.md` | **(MỚI — AIKING gốc dùng inline prompt)** | Analytics Agent — load qua Drive node tương tự 4 file trên |

## Cách triển khai

### Bước 1 — Upload Drive
1. Tạo folder mới trên Google Drive: `Emelee AIKING Skills`
2. Upload 4 file .md từ folder này lên
3. Copy lại 4 file ID mới (xem trong URL `https://drive.google.com/file/d/{FILE_ID}/view`)

### Bước 2 — Update workflow N8N
Trong từng workflow JSON, tìm node `SKILLs orchestrator` / `SKILLs research` / `SKILLs content.md` / `SKILLs creative.md` và thay `fileId.value` bằng ID mới.

Tương tự thay `cachedResultName` và `cachedResultUrl` cho khớp.

### Bước 3 — Update key trong Content & Creative workflow
Vì Emelee đã đổi LinkedIn → TikTok, cần update:

**Content Agent JSON:**
- Trong node `AI Agent1`: prompt vẫn đúng format JSON 3 key, nhưng đổi `"content linkedin"` → `"content tiktok"` trong prompt
- Trong node `Save results content1`: cột "Content Linkedin" → "Content Tiktok" (hoặc thêm cột mới)
- Trong node `Edit Fields1`: rename field

**Creative Agent JSON:**
- Trong node `Code in JavaScript` line đầu, mảng `keys`:
  ```js
  const keys = ['json fb', 'json instagram', 'json tiktok'];  // cũ: ['json fb', 'json linkedin', 'json instagram']
  ```
- Trong node `Append row in sheet`: cột "Linkedin" → "TikTok" mapping `webContentLink`

**Marketing Team Agent JSON:**
- Trong node `Content Agent` tool schema: bỏ `sample post` nếu không dùng (vẫn giữ được)
- Trong node `Creative Agent` tool schema: đổi `content linkedin` → `content tiktok`
- Trong node `Publisher Agent` tool schema: đổi `content linkedin` + `img linkedin` → `content tiktok` + `img tiktok`

### Bước 4 — Verify
Test bằng câu lệnh đơn giản trong Telegram:
```
nghiên cứu trend moissanite tháng này
```
→ Marketing Team Agent gọi Research → trả về báo cáo Markdown.

```
viết 1 bài SRT theo phong cách tự thưởng
```
→ Marketing Team Agent gọi Content → trả về JSON 3 nền tảng.

## Lưu ý quan trọng

- **Token FB cũ trong workflow gốc đã bị lộ** (EAAkgVQC6Vew...). Đi revoke ngay tại Facebook Business → System User trước khi import.
- 4 file này dùng tiếng Việt cho dễ chỉnh, nhưng output JSON keys vẫn dùng tiếng Anh để khớp N8N.
- Khi update file trên Drive, **không cần redeploy N8N** — workflow load file mỗi lần chạy.
