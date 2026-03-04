import { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';

/**
 * ノード詳細（コード断片・隣接ノード・リスク情報）を取得するフック。
 * nodeId が null の場合はフェッチしない。
 */
export function useNodeDetail({ owner, repo, prNumber, nodeId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!nodeId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(null);

    fetch(`${BACKEND_URL}/api/prs/${owner}/${repo}/${prNumber}/nodes?id=${encodeURIComponent(nodeId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
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

  return { data, loading, error };
}
