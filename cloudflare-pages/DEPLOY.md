# Deploy ThaiLLM Proxy บน Cloudflare Pages

Proxy แก้ CORS ระหว่าง ai-lesson-plannerv3 (browser SPA) กับ thaillm.or.th

**ทำไม Cloudflare Pages:**
- ฟรี 100K requests/day (Pages Functions)
- Auto-deploy จาก GitHub ทุก push (ไม่มี Hobby restriction แบบ Vercel)
- Edge runtime — เร็วมาก ไม่มี cold start

---

## ⚡ ขั้นตอน Deploy (ครั้งเดียวจบ ~3 นาที)

### Step 1: ไป Cloudflare Dashboard

https://dash.cloudflare.com → เมนูซ้าย **Compute** → **Workers & Pages**

### Step 2: Create Pages Project

1. กด **`Create application`** (มุมขวาบน)
2. เลือก tab **`Pages`** (ไม่ใช่ Workers)
3. กด **`Connect to Git`**

### Step 3: Authorize GitHub

1. กด **`Connect GitHub account`** (ถ้ายังไม่ authorize)
2. Authorize Cloudflare ใน GitHub
3. เลือก repository: `teacherarm-dotcom/ai-lesson-plannerv3-Full`
4. กด **`Begin setup`**

### Step 4: Configure Build Settings

กรอกตามนี้:

| Field | Value |
|---|---|
| **Project name** | `thaillm-proxy` (หรือชื่อที่ต้องการ) |
| **Production branch** | `main` |
| **Framework preset** | **None** |
| **Build command** | (ปล่อยว่าง — ไม่ต้อง build) |
| **Build output directory** | `cloudflare-pages` |
| **Root directory (advanced)** | `cloudflare-pages` |

> ⚠️ **สำคัญ:** Root directory = `cloudflare-pages` (ตรงตามนี้)

### Step 5: Save and Deploy

กด **`Save and Deploy`** → รอ ~30 วินาที

หลัง deploy เสร็จ จะได้ URL:
```
https://thaillm-proxy.pages.dev
```
(หรือ `https://thaillm-proxy-xxx.pages.dev` ถ้าชื่อชน)

### Step 6: ทดสอบ

เปิด browser:
```
https://thaillm-proxy.pages.dev/api/health
```

ต้องเห็น:
```json
{
  "status": "ok",
  "service": "thaillm-proxy (Cloudflare Pages)",
  ...
}
```

### Step 7: ตั้ง env var ใน Render

1. https://dashboard.render.com → service `ai-lesson-plannerv3-full` → **Environment**
2. แก้ `VITE_THAILLM_PROXY_URL` → ค่าใหม่:
   ```
   https://thaillm-proxy.pages.dev
   ```
3. กด **Save and rebuild** → รอ ~2 นาที

### Step 8: Hard refresh เว็บ

เปิด `plan.kruarm.net` → `Cmd+Shift+R`

---

## 🔄 Auto-Deploy

หลังเสร็จ Step 1-6 — **ทุกครั้งที่ push commit ใน folder `cloudflare-pages/`** → Cloudflare จะ auto-deploy ทันที (ไม่ต้องทำอะไร)

---

## 📊 ดู Usage

Cloudflare Dashboard → Workers & Pages → `thaillm-proxy` → tab **Metrics**

Free tier: **100,000 requests/day** — เพียงพอ
