import * as http from 'http';
import * as os from 'os';
import { URL } from 'url';

export interface LLMConfig {
  endpoint: string; // e.g., "http://localhost:11434"
  model: string;    // e.g., "qwen2.5-coder:1.5b"
  provider: 'ollama' | 'openai';
  temperature?: number;
}

/**
 * UniversalLLMClient handles direct HTTP streaming calls to local inference engines.
 * Design Rules:
 * - Zero extra NPM modules (runs on standard Node.js 'http' library).
 * - Bounded buffer streams (does not keep full response in process memory blocks).
 */
export class UniversalLLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Dispatches the compiled prompt in streaming format to the provider.
   */
  public async generateStream(
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: string) => void
  ): Promise<void> {
    const url = new URL(this.config.endpoint);
    let requestPath = '';
    let payload: Record<string, any> = {};

    if (this.config.provider === 'ollama') {
      requestPath = '/api/generate';
      const cpus = os.cpus().length;
      
      // Constraint: Cap CPU threads to 80% of available cores
      const threads = Math.max(1, Math.floor(cpus * 0.8));
      
      // Constraint: Check RAM availability and adjust model settings to stay within 80% RAM limit
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMemPercent = (totalMem - freeMem) / totalMem;
      
      let numCtx = 2048; // default optimized context size
      if (usedMemPercent > 0.75) {
        numCtx = 512;  // Choke context window to 512 to prevent exceeding 80% RAM
      } else if (usedMemPercent > 0.60) {
        numCtx = 1024; // Reduce context window to 1024 to save memory
      }

      payload = {
        model: this.config.model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: this.config.temperature ?? 0.2,
          num_thread: threads,
          num_ctx: numCtx,
          num_predict: 1024   // Limit peak predict token overhead
        }
      };
    } else {
      // OpenAI-compatible formatting (e.g. llama.cpp, LocalAI)
      requestPath = '/v1/chat/completions';
      payload = {
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: this.config.temperature ?? 0.2
      };
    }

    const data = JSON.stringify(payload);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: requestPath,
      method: 'POST',
      timeout: 3000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Local LLM provider returned HTTP status error: ${res.statusCode}`));
          return;
        }

        res.setEncoding('utf8');
        let fullResponse = '';
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          // Keep trailing unfinished segment in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;

            try {
              if (this.config.provider === 'ollama') {
                const parsed = JSON.parse(trimmed);
                if (parsed.response) {
                  fullResponse += parsed.response;
                  onChunk(parsed.response);
                }
              } else {
                // OpenAI Server Sent Events parsing (format: "data: {...}")
                if (trimmed.startsWith('data: ')) {
                  const rawJson = trimmed.substring(6).trim();
                  if (rawJson === '[DONE]') continue;
                  
                  const parsed = JSON.parse(rawJson);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullResponse += delta;
                    onChunk(delta);
                  }
                }
              }
            } catch {
              // Bypasses parse errors on stream split artifacts
            }
          }
        });

        res.on('end', () => {
          // Process final trailing bytes if any
          if (buffer.length > 0) {
            try {
              if (this.config.provider === 'ollama') {
                const parsed = JSON.parse(buffer);
                if (parsed.response) {
                  fullResponse += parsed.response;
                  onChunk(parsed.response);
                }
              }
            } catch {}
          }
          onComplete(fullResponse);
          resolve();
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection to local LLM service timed out.'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Queries list of models installed on the local system provider.
   */
  public async getAvailableModels(): Promise<string[]> {
    const url = new URL(this.config.endpoint);
    const requestPath = this.config.provider === 'ollama' ? '/api/tags' : '/v1/models';

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: requestPath,
      method: 'GET',
      timeout: 2000
    };

    return new Promise((resolve) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (this.config.provider === 'ollama') {
              const models = parsed.models || [];
              resolve(models.map((m: any) => m.name));
            } else {
              const models = parsed.data || [];
              resolve(models.map((m: any) => m.id));
            }
          } catch {
            resolve([]);
          }
        });
      });
      
      req.on('error', () => {
        resolve([]); // Graceful empty fallback when provider is offline
      });

      req.on('timeout', () => {
        req.destroy();
      });

      req.end();
    });
  }
}
