import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

type Env = {
  DB: D1Database;
  OMNI_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.post('/chat', async (c) => {
  const { model, messages } = await c.req.json();

  // 1. 查询 D1 数据库获取模型路由
  const route = await c.env.DB.prepare(
    "SELECT * FROM model_routes WHERE model_name = ?"
  ).bind(model).first<{ provider: string; actual_model: string }>();

  if (!route) {
    return c.json({ error: "不支持的模型" }, 400);
  }

  // 2. 选择上游提供商
  let apiUrl = '';
  let apiKey = '';

  if (route.provider === 'deepseek') {
    apiUrl = 'https://api.deepseek.com/chat/completions';
    apiKey = c.env.DEEPSEEK_API_KEY || '';
  } else if (route.provider === 'openai') {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    apiKey = c.env.OPENAI_API_KEY || '';
  }

  if (!apiKey) {
    return c.json({ error: `未检测到 ${route.provider} 的 API Key，请在 Cloudflare 环境变量中添加` }, 500);
  }

  // 3. 向上游发起请求
  const upstreamRes = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: route.actual_model,
      messages,
      stream: true
    })
  });

  if (!upstreamRes.ok) {
    const errorText = await upstreamRes.text();
    return c.json({ error: `上游接口错误: ${errorText}` }, upstreamRes.status as any);
  }

  // 4. 流式转换输出
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  (async () => {
    const reader = upstreamRes.body!.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const textChunk = json.choices[0]?.delta?.content || '';
              if (textChunk) {
                await writer.write(encoder.encode(textChunk));
              }
            } catch (e) {}
          }
        }
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    }
  });
});

export const onRequest = handle(app);
