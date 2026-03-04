import { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_BASE_URL || '';

/**
 * PR可視化データを取得するフック。
 * 処理中（not_ready）の場合は3秒間隔でポーリングする。
 */
export function usePRVisualization({ owner, repo, prNumber }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | processing | completed | failed | not_found
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;

    async function fetchData() {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/prs/${owner}/${repo}/${prNumber}/visualization`
        );

        if (cancelled) return;

        if (res.status === 404) {
          const body = await res.json();
          if (cancelled) return;
          if (body.error === 'not_ready') {
            setStatus('processing');
            // まだ処理中のため3秒後に再試行
            pollTimer = setTimeout(fetchData, 3000);
          } else {
            setStatus('not_found');
          }
          return;
        }

        if (!res.ok) {
          throw new Error(`APIエラー: ${res.status}`);
        }

        const json = await res.json();
        setData(json);
        setStatus('completed');
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setStatus('failed');
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [owner, repo, prNumber]);

  return { data, status, error };
}
