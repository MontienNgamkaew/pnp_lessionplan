# Deploy ThaiLLM Proxy บน Vercel (Edge Function)

Proxy แก้ปัญหา CORS ระหว่าง ai-lesson-plannerv3 (browser SPA) กับ thaillm.or.th

**ทำไม Vercel Edge Function:**
- ฟรี 1M invocations/เดือน — เกินพอ
- Edge runtime — เร็วมาก ไม่มี cold start
- Deploy ง่ายผ่าน GitHub หรือ CLI

---

## ⚡ ขั้นตอน Deploy (5 นาที)

### Step 1: ติดตั้ง Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login Vercel (ครั้งเดียว)

```bash
vercel login
```
เลือก "Continue with Email" หรือ "Continue with GitHub"

### Step 3: Deploy

```bash
cd vercel-proxy
vercel --prod
```

Vercel ถามคำถาม:
- **Set up and deploy?** → `Y`
- **Which scope?** → เลือก account ของคุณ
- **Link to existing project?** → `N`
- **What's your project's name?** → `thaillm-proxy` (หรือชื่อที่ต้องการ)
- **In which directory is your code located?** → `./` (Enter)
- **Want to override settings?** → `N`

หลัง deploy เสร็จ จะได้ URL เช่น:
```
https://thaillm-proxy-abc123.vercel.app
```

### Step 4: ทดสอบ Health Check

เปิด URL ใน browser:
```
https://thaillm-proxy-abc123.vercel.app/api/health
```

ต้องเห็น JSON:
```json
{
  "status": "ok",
  "service": "thaillm-proxy (Vercel Edge)",
  "upstream": "https://thaillm.or.th",
  "allowed_origins": [...]
}
```

### Step 5: ทดสอบ models endpoint

```bash
curl https://thaillm-proxy-abc123.vercel.app/api/v1/models
```

ต้องเห็น list ของ 4 ThaiLLM models

### Step 6: ตั้ง env var ใน Render

1. ไป https://dashboard.render.com → service `ai-lesson-plannerv3-full`
2. เมนูซ้าย → **Environment**
3. **Add Environment Variable**:
   - Key: `VITE_THAILLM_PROXY_URL`
   - Value: `https://thaillm-proxy-abc123.vercel.app` (URL จาก Step 3)
4. **Save Changes** → Render rebuild + redeploy (~2 นาที)

### Step 7: ทดสอบในแอป

1. เปิดแอป → กดปุ่ม "ตั้งค่า AI"
2. เลือก **ThaiLLM**
3. ใส่ API key (จาก thaillm.or.th)
4. กด **บันทึก**
5. ลองสร้าง LO / Competency ดู

---

## 🛡️ ความปลอดภัย

- ✅ User's API key เก็บใน localStorage ของ user (ไม่ผ่าน proxy)
- ✅ Proxy stateless — ไม่เก็บ key ไว้
- ✅ Origin allowlist — เฉพาะ ai-lesson-plannerv3 domains
- ✅ Edge function (ฟรี) ไม่ requires server management

---

## 🔄 Update Proxy

เมื่อต้องการแก้โค้ดของ proxy:
```bash
cd vercel-proxy
# แก้ไฟล์ api/v1/[...path].js หรือ api/health.js
vercel --prod
```

---

## 📊 ดู Usage

Vercel Dashboard → Project `thaillm-proxy` → **Functions** หรือ **Analytics**
- เห็น request count / latency / errors
- Free tier: 1M invocations/month, 100GB bandwidth
