const FUNCTION_PATTERNS = [
  /function\s+([A-Za-z_$][\w$]*)\s*\(/,
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
  /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>/,
  /(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/,
  /def\s+([A-Za-z_][\w!?=]*)/,
  /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?[A-Za-z_<>\[\],?]+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/
];

async function collectPullRequestMetadata({ githubClient, repositoryFullName, prNumber }) {
  const { owner, repo } = splitRepository(repositoryFullName);

  const prResponse = await githubClient.get(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const files = await fetchAllPrFiles({ githubClient, owner, repo, prNumber });
  const lineStats = calculateLineStats(files);
  const changedFunctionCandidates = extractChangedFunctionCandidates(files);

  return {
    collectedAt: new Date().toISOString(),
    repositoryFullName,
    prNumber,
    prTitle: prResponse.data.title || "",
    prDescription: prResponse.data.body || "",
    prUrl: prResponse.data.html_url || "",
    lineStats,
    files: files.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes
    })),
    changedFunctionCandidates
  };
}

async function fetchAllPrFiles({ githubClient, owner, repo, prNumber }) {
  const files = [];
  let page = 1;

  while (true) {
    const { data } = await githubClient.get(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`
    );
    files.push(...data);
    if (data.length < 100) {
      break;
    }
    page += 1;
  }

  return files;
}

function calculateLineStats(files) {
  return files.reduce(
    (stats, file) => {
      stats.additions += Number(file.additions || 0);
      stats.deletions += Number(file.deletions || 0);
      return stats;
    },
    { additions: 0, deletions: 0 }
  );
}

function extractChangedFunctionCandidates(files) {
  const seen = new Set();
  const results = [];

  for (const file of files) {
    const patch = file.patch || "";
    if (!patch) {
      continue;
    }

    for (const rawLine of patch.split("\n")) {
      if (!rawLine) {
        continue;
      }

      if (rawLine.startsWith("@@")) {
        const context = rawLine.split("@@").slice(2).join("@@").trim();
        addCandidate(file.filename, context, seen, results);
        continue;
      }

      if (rawLine.startsWith("+") || rawLine.startsWith("-")) {
        addCandidate(file.filename, rawLine.slice(1).trim(), seen, results);
      }
    }
  }

  return results;
}

function addCandidate(filename, text, seen, results) {
  const name = extractFunctionName(text);
  if (!name) {
    return;
  }

  const key = `${filename}::${name}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  results.push({ filename, functionName: name });
}

function extractFunctionName(text) {
  for (const pattern of FUNCTION_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function splitRepository(repositoryFullName) {
  if (!repositoryFullName || !repositoryFullName.includes("/")) {
    throw new Error(`invalid repositoryFullName: ${repositoryFullName}`);
  }

  const [owner, repo] = repositoryFullName.split("/");
  if (!owner || !repo) {
    throw new Error(`invalid repositoryFullName: ${repositoryFullName}`);
  }

  return { owner, repo };
}

module.exports = {
  collectPullRequestMetadata,
  extractChangedFunctionCandidates
};
