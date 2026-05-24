import json
import os
from typing import Any

import sqlparse
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

load_dotenv()

app = FastAPI(title="Dr.DB API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.3-70b-versatile"

class AnalyzeRequest(BaseModel):
    query: str
    schema: str | None = None
    row_counts: dict[str, Any] | None = None

class RewriteRequest(BaseModel):
    original_query: str
    selected_treatment_ids: list[str]
    treatments: list[dict[str, Any]]

class ChatRequest(BaseModel):
    message: str
    conversation_history: list[dict[str, str]]
    original_query: str
    diagnosis_summary: str


def likely_valid_sql(query: str) -> bool:
    parsed = sqlparse.parse(query)
    if not parsed:
        return False
    text = query.strip().lower()
    return any(text.startswith(k) for k in ["select", "update", "delete", "insert", "with", "create", "alter", "drop"])


def call_groq_json(messages: list[dict[str, str]]) -> dict[str, Any]:
    try:
        resp = client.chat.completions.create(model=MODEL, messages=messages, temperature=0.2)
        return json.loads(resp.choices[0].message.content or "{}")
    except Exception:
        retry = messages + [{"role": "user", "content": "IMPORTANT: Return ONLY a raw JSON object. Start with { end with }. No markdown. No backticks. No explanation. Nothing else."}]
        try:
            resp = client.chat.completions.create(model=MODEL, messages=retry, temperature=0.1)
            return json.loads(resp.choices[0].message.content or "{}")
        except Exception:
            raise HTTPException(status_code=500, detail="Dr.DB couldn't complete the diagnosis. Please try again.")


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")

    if not likely_valid_sql(req.query):
        explanation = call_groq_json([
            {"role": "system", "content": "You are Dr.DB. Return ONLY JSON with key explanation describing SQL issue in plain English."},
            {"role": "user", "content": f"Explain what's wrong with this SQL:\n{req.query}"},
        ])
        return {
            "critical_condition_detected": True,
            "message": f"Dr.DB found a critical condition in your query: {explanation.get('explanation', 'The SQL appears invalid.')}"
        }

    prompt = {
        "role": "system",
        "content": "You are Dr.DB, an expert SQL performance physician. Analyze the given SQL query. Return ONLY a valid JSON object. No markdown, no backticks, no extra text.",
    }
    user = {
        "role": "user",
        "content": f"Query:\n{req.query}\n\nSchema:\n{req.schema or 'Not provided'}\n\nRow counts:\n{json.dumps(req.row_counts or {})}\n\nReturn exact schema with critical_conditions, treatment_plan, possible_errors, optimized_query, original_query_score, optimized_query_score, total_estimated_time_saved_seconds. treatment_plan severity: moderate|minor. confidence: high|medium|low.",
    }
    return call_groq_json([prompt, user])


@app.post("/rewrite")
def rewrite(req: RewriteRequest):
    selected = [t for t in req.treatments if t.get("id") in set(req.selected_treatment_ids)]
    prescription = "\n\n".join(
        [f"-- Treatment {i+1}: {t.get('title','Untitled')}\n{t.get('migration_sql','')}" for i, t in enumerate(selected)]
    )

    rewrite_json = call_groq_json([
        {"role": "system", "content": "Return ONLY JSON: {\"rewritten_query\": \"...\"}"},
        {"role": "user", "content": f"Original query:\n{req.original_query}\n\nApply only these treatments:\n{json.dumps(selected)}"},
    ])
    return {"rewritten_query": rewrite_json.get("rewritten_query", req.original_query), "prescription": prescription}


@app.post("/chat")
def chat(req: ChatRequest):
    system_msg = {
        "role": "system",
        "content": f"You are Dr.DB. Original query:\n{req.original_query}\nDiagnosis summary:\n{req.diagnosis_summary}",
    }
    messages = [system_msg] + req.conversation_history + [{"role": "user", "content": req.message}]
    try:
        res = client.chat.completions.create(model=MODEL, messages=messages, temperature=0.3)
        return {"response": res.choices[0].message.content or ""}
    except Exception:
        retry = messages + [{"role": "user", "content": "IMPORTANT: Return ONLY plain text answer."}]
        try:
            res = client.chat.completions.create(model=MODEL, messages=retry, temperature=0.2)
            return {"response": res.choices[0].message.content or ""}
        except Exception:
            raise HTTPException(status_code=500, detail="Dr.DB couldn't complete the diagnosis. Please try again.")
