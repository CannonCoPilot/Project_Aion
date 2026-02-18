-- Jarvis Infrastructure: PostgreSQL initialization
-- Runs automatically on first container start via docker-entrypoint-initdb.d

-- n8n requires its own database
CREATE DATABASE n8n;

-- RAG pipeline metadata
CREATE DATABASE rag;

-- Enable extensions in jarvis DB
\c jarvis;
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_search;    -- ParadeDB BM25 full-text

-- Session analytics tables (UC-5)
CREATE TABLE IF NOT EXISTS session_logs (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    context_cycles INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    tools_used JSONB DEFAULT '{}',
    errors JSONB DEFAULT '[]',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS tool_usage (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    invoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS decision_log (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category TEXT,  -- 'architecture', 'tool_selection', 'approach', etc.
    decision TEXT NOT NULL,
    rationale TEXT,
    outcome TEXT,
    tags TEXT[]
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_started_at ON session_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_tool_usage_session_id ON tool_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_name ON tool_usage(tool_name);
CREATE INDEX IF NOT EXISTS idx_decision_log_session_id ON decision_log(session_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_category ON decision_log(category);
