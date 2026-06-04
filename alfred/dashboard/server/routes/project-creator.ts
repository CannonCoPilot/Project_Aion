import type { FastifyInstance } from 'fastify';
import { queryAi } from './ollama.js';

const PULSE_API = process.env.PULSE_API_URL || 'http://localhost:8700/api/v1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:32b';

const TASK_TEMPLATE_PROMPT = `You are a ticket routing assistant. Your ONLY job is to read the user's project description and extract routing metadata as a JSON block.

DO NOT rewrite, summarize, or restate the user's description. The user's original text will be used as the task description verbatim. You are only extracting structured metadata for pipeline routing.

Output ONLY a single JSON block — nothing else, no explanation, no markdown:

{
  "title": "CODE-MASTER: Short descriptive title (under 80 chars)",
  "summary": "One-sentence summary of the task objective.",
  "priority": "high | medium | low",
  "model": "qwen3:32b",
  "persona": "PERSONA_ID",
  "labels": ["project:PROJECT_NAME"]
}

Available personas (pick the best fit):
- librarian: research, analysis, documentation, data extraction
- creative-builder: writing, content creation, narrative, synthesis
- full-stack: general software development, coding, debugging
- ux-eng: frontend, UI/UX, user experience improvements
- devops: infrastructure, deployment, CI/CD, Docker
- data-eng: data pipelines, ETL, database operations
- qa-eng: testing, validation, quality assurance
- docs-writer: technical documentation, guides, READMEs
- security-eng: security audits, vulnerability analysis
- sre: monitoring, alerting, reliability engineering

Rules:
- Set model to "qwen3:32b" unless the user explicitly requests Claude or the task requires code execution/file editing.
- Set model to "claude-sonnet-4-6" only if the user says "use claude" or the task explicitly requires modifying source code.
- Derive the project name from the user's description (e.g., "gospel-synopsis", "data-pipeline", "api-review").
- The title should be a short code prefix + descriptive phrase (e.g., "GS-MASTER: Gospel Text Alignment Pipeline").
- Output ONLY valid JSON. No markdown fences, no explanation, no other text.`;

interface CreateRequest {
  prompt: string;
  model?: string;
  autoLaunch?: boolean;
}

interface TaskMetadata {
  title: string;
  summary: string;
  priority: string;
  model?: string;
  persona?: string;
  labels?: string[];
}

interface TaskPayload {
  title: string;
  description: string;
  priority: string;
  model?: string;
  persona?: string;
  labels?: string[];
  richDescription?: string;
}

function parseMetadataOnly(llmOutput: string): TaskMetadata {
  const jsonMatch = llmOutput.match(/```json\s*([\s\S]*?)```/) || llmOutput.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON metadata');
  }
  const jsonStr = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonStr) as TaskMetadata;
}

async function generateTask(prompt: string): Promise<TaskPayload> {
  const fullPrompt = `${TASK_TEMPLATE_PROMPT}\n\nUser's project description:\n${prompt}`;
  const response = await queryAi(fullPrompt, 1024);
  const meta = parseMetadataOnly(response);

  return {
    title: meta.title,
    description: meta.summary || meta.title,
    priority: meta.priority,
    model: meta.model,
    persona: meta.persona,
    labels: meta.labels,
    richDescription: prompt,
  };
}

async function launchTask(task: TaskPayload, originalPrompt?: string): Promise<{ id: string; title: string }> {
  const pipelineLabels = [
    'staging:wait',
    'evaluated:no',
    'queued:no',
    'active:no',
    'completed:no',
    'blocked:no',
  ];

  const assignedLabel = task.persona ? `assigned:${task.persona}` : 'assigned:librarian';
  const allLabels = [...(task.labels || []), assignedLabel, ...pipelineLabels];

  const body = {
    title: task.title,
    description: task.richDescription || task.description,
    priority: task.priority || 'medium',
    labels: allLabels,
    metadata: {
      model: task.model || 'qwen3:32b',
      source: 'project-creator',
      ai_summary: task.description,
      ...(originalPrompt ? { original_prompt: originalPrompt } : {}),
    },
  };

  const res = await fetch(`${PULSE_API}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pulse task creation failed: ${res.status} ${text}`);
  }

  const result = (await res.json()) as { id: string; title: string };
  return result;
}

export async function projectCreatorRoutes(app: FastifyInstance) {
  // Generate a task from a prompt (preview, don't launch)
  app.post('/api/project-creator/generate', async (request, reply) => {
    const body = request.body as CreateRequest | undefined;
    if (!body?.prompt?.trim()) {
      return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
      const task = await generateTask(body.prompt.trim());
      return { task, status: 'preview' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(502).send({ error: `Generation failed: ${message}` });
    }
  });

  // Generate with streaming — SSE endpoint for real-time token visibility
  app.post('/api/project-creator/generate-stream', async (request, reply) => {
    const body = request.body as CreateRequest | undefined;
    if (!body?.prompt?.trim()) {
      return reply.status(400).send({ error: 'Prompt is required' });
    }

    const userPrompt = body.prompt.trim();
    const fullPrompt = `${TASK_TEMPLATE_PROMPT}\n\nUser's project description:\n${userPrompt}`;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('status', { stage: 'connecting', model: OLLAMA_MODEL });

    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: fullPrompt,
          stream: true,
          think: false,
          options: { temperature: 0.15, num_predict: 1024 },
        }),
      });

      if (!res.ok || !res.body) {
        send('error', { message: `Ollama error: ${res.status}` });
        reply.raw.end();
        return;
      }

      send('status', { stage: 'generating', model: OLLAMA_MODEL });

      let fullResponse = '';
      let tokenCount = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const chunk = JSON.parse(line) as {
              response?: string;
              done?: boolean;
              total_duration?: number;
              prompt_eval_count?: number;
              eval_count?: number;
            };
            if (chunk.response) {
              fullResponse += chunk.response;
              tokenCount++;
              send('token', { text: chunk.response, count: tokenCount });
            }
            if (chunk.done) {
              send('telemetry', {
                total_duration_ms: (chunk.total_duration || 0) / 1_000_000,
                prompt_tokens: chunk.prompt_eval_count || 0,
                completion_tokens: chunk.eval_count || 0,
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      // Parse metadata-only response; user's original prompt is the description
      try {
        const meta = parseMetadataOnly(fullResponse);
        const task: TaskPayload = {
          title: meta.title,
          description: meta.summary || meta.title,
          priority: meta.priority,
          model: meta.model,
          persona: meta.persona,
          labels: meta.labels,
          richDescription: userPrompt,
        };
        send('task', { task, status: 'preview' });
      } catch {
        send('error', { message: 'AI response did not contain valid JSON metadata', raw: fullResponse.slice(0, 500) });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      send('error', { message });
    }

    send('done', {});
    reply.raw.end();
  });

  // Generate and immediately launch to the board
  app.post('/api/project-creator/launch', async (request, reply) => {
    const body = request.body as CreateRequest | undefined;
    if (!body?.prompt?.trim()) {
      return reply.status(400).send({ error: 'Prompt is required' });
    }

    try {
      const prompt = body.prompt.trim();
      const task = await generateTask(prompt);
      const result = await launchTask(task, prompt);
      return { task, launched: result, status: 'launched' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(502).send({ error: `Launch failed: ${message}` });
    }
  });

  // Launch a pre-generated task (user reviewed and confirmed)
  app.post('/api/project-creator/confirm', async (request, reply) => {
    const body = request.body as { task: TaskPayload; originalPrompt?: string } | undefined;
    if (!body?.task?.title) {
      return reply.status(400).send({ error: 'Task payload is required' });
    }

    try {
      const result = await launchTask(body.task, body.originalPrompt);
      return { launched: result, status: 'launched' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(502).send({ error: `Launch failed: ${message}` });
    }
  });

  // Chat with the AI about refining a task
  app.post('/api/project-creator/refine', async (request, reply) => {
    const body = request.body as { task: TaskPayload; instruction: string } | undefined;
    if (!body?.task || !body?.instruction?.trim()) {
      return reply.status(400).send({ error: 'Task and instruction are required' });
    }

    const refinePrompt = `You are adjusting routing metadata for a task ticket based on the user's instruction.

Current metadata:
${JSON.stringify({ title: body.task.title, summary: body.task.description, priority: body.task.priority, model: body.task.model, persona: body.task.persona, labels: body.task.labels }, null, 2)}

User's instruction:
${body.instruction.trim()}

Output ONLY the updated JSON metadata block (same schema). Change only what the user asked to change:`;

    try {
      const response = await queryAi(refinePrompt, 1024);
      const meta = parseMetadataOnly(response);
      const refined: TaskPayload = {
        title: meta.title,
        description: meta.summary || meta.title,
        priority: meta.priority,
        model: meta.model,
        persona: meta.persona,
        labels: meta.labels,
        richDescription: body.task.richDescription,
      };
      return { task: refined, status: 'refined' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(502).send({ error: `Refinement failed: ${message}` });
    }
  });
}
