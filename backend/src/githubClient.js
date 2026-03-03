const DEFAULT_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

class GithubApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GithubApiError";
    this.status = details.status || null;
    this.responseBody = details.responseBody || null;
  }
}

class GithubClient {
  constructor({ token, apiBaseUrl = "https://api.github.com", fetchImpl = fetch }) {
    this.token = token;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
  }

  async get(path, options = {}) {
    return this.request(path, { ...options, method: "GET" });
  }

  async request(path, options = {}) {
    const attempts = options.attempts || 3;
    const method = options.method || "GET";
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "User-Agent": "ai-review-poc",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, { method, headers });
        if (response.ok) {
          const data = await response.json();
          return {
            data,
            response
          };
        }

        const responseBody = await response.text();
        const isRetryable = DEFAULT_RETRYABLE_STATUS_CODES.has(response.status);
        if (isRetryable && attempt < attempts) {
          await sleep(backoffMs(attempt));
          continue;
        }

        throw new GithubApiError(`GitHub API request failed: ${method} ${path}`, {
          status: response.status,
          responseBody
        });
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
    }

    if (lastError instanceof GithubApiError) {
      throw lastError;
    }
    throw new GithubApiError(`GitHub API request failed after retries: ${method} ${path}`, {
      responseBody: lastError?.message || "unknown error"
    });
  }
}

function backoffMs(attempt) {
  return attempt * 200;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  GithubApiError,
  GithubClient
};
