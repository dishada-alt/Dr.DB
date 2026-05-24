# Dr.DB
Your database's personal physician.

## Stack
- Frontend: React SPA
- Backend: FastAPI + OpenAI SDK (Groq-compatible)
- AI model: `llama-3.3-70b-versatile`

## Setup
### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# set GROQ_API_KEY
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Environment
`backend/.env`
```env
GROQ_API_KEY=your_key_here
```
