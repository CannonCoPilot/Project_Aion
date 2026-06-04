import type { FastifyInstance } from 'fastify';
import {
  getTaskById,
  getEventsByTaskId,
  updateTask,
  addComment,
} from '../services/pulse-client.js';
import { buildAiPrompt } from '../services/ai-context.js';
import { readSettings } from '../services/nexus-settings.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

interface AiConfig {
  provider: 'ollama' | 'openai';
  model: string;
  temperature: number;
}

function getAiConfig(): AiConfig {
  const settings = readSettings();
  const ai = settings.ai_provider;
  const provider = ai?.provider ?? 'ollama';
  return {
    provider,
    model:
      provider === 'openai'
        ? (ai?.openai_model ?? 'gpt-4o-mini')
        : (ai?.ollama_model ?? process.env.OLLAMA_MODEL ?? 'qwen3:32b'),
    temperature: ai?.temperature ?? 0.3,
  };
}

async function queryOllama(prompt: string, maxTokens: number, config: AiConfig): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      options: {
        temperature: config.temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }

  const result = (await res.json()) as { response: string };
  return result.response.trim();
}

async function queryOpenAI(prompt: string, maxTokens: number, config: AiConfig): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: config.temperature,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const result = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  if (!result.choices?.length) {
    throw new Error('OpenAI returned no choices');
  }
  return result.choices[0].message.content.trim();
}

export async function queryAi(prompt: string, maxTokens: number): Promise<string> {
  const config = getAiConfig();
  if (config.provider === 'openai') {
    return queryOpenAI(prompt, maxTokens, config);
  }
  return queryOllama(prompt, maxTokens, config);
}

export async function ollamaRoutes(app: FastifyInstance) {
  // Ask a question about a task
  app.post('/api/tasks/:id/ask', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { question: string; pageContext?: string } | undefined;

    if (!body?.question?.trim()) {
      return reply.status(400).send({ error: 'Question is required' });
    }

    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const events = await getEventsByTaskId(id);
    const prompt = await buildAiPrompt({
      pageContext: body.pageContext ?? 'task-detail',
      task,
      events,
      instruction: body.question.trim(),
    });

    try {
      const answer = await queryAi(prompt, 1024);
      return { answer };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(502).send({ error: `AI query failed: ${message}` });
    }
  });

  // Save a Q&A exchange as a comment on the task
  app.post('/api/tasks/:id/ask/save', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { question: string; answer: string } | undefined;

    if (!body?.question?.trim() || !body?.answer?.trim()) {
      return reply.status(400).send({ error: 'Both question and answer are required' });
    }

    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const comment = `[Ask AI] Q: ${body.question.trim()}\n\nA: ${body.answer.trim()}`;
    await addComment(id, comment);
    return { ok: true };
  });

  // Generate AI summary for a task
  app.post('/api/tasks/:id/summarize', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { save?: boolean } | undefined;

    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const events = await getEventsByTaskId(id);
    const prompt = await buildAiPrompt({
      pageContext: 'task-detail',
      task,
      events,
      instruction: [
        'Provide a clear, concise summary that helps a human reviewer quickly understand:',
        '1. What this task is about',
        '2. What stage/state it is currently in (use correct label terminology)',
        '3. What action is needed (if any) and from whom',
        '4. Any blockers or important context',
        'Keep the summary to 3-6 sentences. Be direct and practical.',
      ].join('\n'),
    });

    try {
      const summary = await queryAi(prompt, 512);

      if (body?.save) {
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const existingNotes = task.notes ?? '';
        const separator = existingNotes ? '\n\n' : '';
        const newNotes = `${existingNotes}${separator}## AI Summary (${timestamp})\n${summary}`;
        await updateTask(id, { notes: newNotes });
      }

      return { summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(502).send({ error: `AI query failed: ${message}` });
    }
  });
}
