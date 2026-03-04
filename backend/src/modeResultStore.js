'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_DIR = path.join(__dirname, '..', 'data', 'mode-results');

/**
 * モード生成結果を JSON ファイルに保存する。
 * 保存先: data/mode-results/<repo>/pr-<number>.json
 *
 * @param {{ repositoryFullName: string, prNumber: number, modes: object }} params
 * @returns {Promise<string>} 保存ファイルのパス
 */
async function saveModeResults({ repositoryFullName, prNumber, modes }) {
  const safeRepoName = (repositoryFullName || 'unknown-repository').replace(/\//g, '__');
  const safePrNumber = String(parseInt(prNumber, 10));
  const outputPath = path.join(BASE_DIR, safeRepoName, `pr-${safePrNumber}.json`);
  if (!outputPath.startsWith(BASE_DIR + path.sep)) {
    throw new Error(`invalid output path: ${outputPath}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify({ savedAt: new Date().toISOString(), repositoryFullName, prNumber, modes }, null, 2)}\n`,
    'utf8'
  );
  return outputPath;
}

async function getModeResults({ repositoryFullName, prNumber }) {
  const safeRepoName = (repositoryFullName || 'unknown-repository').replace(/\//g, '__');
  const safePrNumber = String(parseInt(prNumber, 10));
  const outputPath = path.join(BASE_DIR, safeRepoName, `pr-${safePrNumber}.json`);
  if (!outputPath.startsWith(BASE_DIR + path.sep)) {
    throw new Error(`invalid output path: ${outputPath}`);
  }
  try {
    const json = await fs.readFile(outputPath, 'utf8');
    return JSON.parse(json);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

module.exports = { saveModeResults, getModeResults };
