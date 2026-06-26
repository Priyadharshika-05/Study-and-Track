# ✨ TNPSC Study Buddy

Your personal whimsical study notes & test tracker for TNPSC preparation!

---

## 🚀 Setup

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd tnpsc-app
npm install
```

### 2. Create your `.env` file (never commit this!)
```
MONGO_URI=mongodb+srv://iotproject4444:iotproject4444password@cluster0.b0hkzok.mongodb.net/tnpsc
SESSION_SECRET=pick_any_long_random_string_here_like_tnpsc2024superSecret
PORT=3000
```

### 3. Run locally
```bash
npm run dev
```
Visit: http://localhost:3000

---

## 🌐 Deploy on Render

1. Push your code to GitHub (`.env` is gitignored — safe ✅)
2. Go to [render.com](https://render.com) → New → **Web Service**
3. Connect your GitHub repo
4. Set these:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Add **Environment Variables** in Render dashboard:
   - `MONGO_URI` = your MongoDB connection string
   - `SESSION_SECRET` = any long random string
   - `PORT` = 3000
6. Deploy! 🎉

---

## 📁 File Structure
```
/
├── public/
│   └── index.html      ← entire frontend
├── server.js           ← Express backend + MongoDB
├── package.json
├── .env                ← your secrets (gitignored)
├── .env.example        ← template (safe to commit)
├── .gitignore
└── README.md
```

---

## ✨ Features
- 🔐 Multi-user accounts (register/login/delete)
- 📚 Hierarchical notes: Unit → 1. → 1.1 → 1.1.1 with auto-numbering
- ✏️ Rich text editor (bold, italic, headings, bullet lists)
- 🖨️ Print / Export to PDF via browser
- 🎯 Test tracker with unit linking + free subject
- 📊 Progress dashboard with charts
- 🌸 Whimsical pastel design with animations
