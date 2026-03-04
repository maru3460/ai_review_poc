import { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';

/**
 * ノードのAI解説を非同期取得するフック。
 * nodeId が null の場合はフェッチしない。
 * LLM 呼び出しのため応答に数秒かかる場合がある。
 */
export function useNodeExplain({ owner, repo, prNumber, nodeId }) {
  const [aiExplanation, setAiExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!nodeId) {
      setAiExplanation(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setAiExplanation(null);
    setError(null);

    fetch(`${BACKEND_URL}/api/prs/${owner}/${repo}/${prNumber}/nodes/explain?id=${encodeURIComponent(nodeId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setAiExplanation(json.aiExplanation);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [owner, repo, prNumber, nodeId]);

  return { aiExplanation, loading, error };
}
