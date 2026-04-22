// Ollama local embedding client (raw fetch — no @ai-sdk dependency)

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";

function checkOllamaError(res: Response): never {
	console.error(
		`[embeddings] Ollama request failed: ${res.status} ${res.statusText}`,
	);
	throw new Error(
		"Embedding generation failed. Check your local Ollama server and model.",
	);
}

async function fetchWithRetry(url: string, body: object): Promise<Response> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(15_000),
			});
			return res;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
			}
		}
	}

	throw lastError;
}

export async function generateEmbedding(text: string): Promise<number[]> {
	const res = await fetchWithRetry(`${OLLAMA_BASE_URL}/api/embeddings`, {
		model: OLLAMA_EMBEDDING_MODEL,
		prompt: text,
	});

	if (!res.ok) checkOllamaError(res);

	const data = (await res.json()) as { embedding?: number[] };
	if (!Array.isArray(data.embedding)) {
		throw new Error(
			"Embedding generation failed. Check your local Ollama server and model.",
		);
	}
	return data.embedding;
}

export async function generateEmbeddings(
	texts: string[],
): Promise<number[][]> {
	if (texts.length === 0) return [];

	const res = await fetchWithRetry(`${OLLAMA_BASE_URL}/api/embed`, {
		model: OLLAMA_EMBEDDING_MODEL,
		input: texts,
	});

	if (!res.ok) checkOllamaError(res);

	const data = (await res.json()) as { embeddings?: number[][] };
	if (!Array.isArray(data.embeddings)) {
		throw new Error(
			"Embedding generation failed. Check your local Ollama server and model.",
		);
	}
	return data.embeddings;
}
