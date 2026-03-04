import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ThreePaneLayout } from '../components/ThreePaneLayout';
import { FileTreePane } from '../components/FileTreePane';
import { VisualizationPane } from '../components/VisualizationPane';
import { ReviewInfoPane } from '../components/ReviewInfoPane';
import { usePRVisualization } from '../hooks/usePRVisualization';
import { useNodeDetail } from '../hooks/useNodeDetail';
import { useNodeExplain } from '../hooks/useNodeExplain';

/**
 * PR可視化ページ。
 * URLパラメータ /prs/:owner/:repo/:prNumber からデータを取得して3ペインUIを表示する。
 */
export function PRVisualizationPage() {
  const { owner, repo, prNumber } = useParams();
  const [activeMode, setActiveMode] = useState('workflowChange');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const { data, status, error } = usePRVisualization({ owner, repo, prNumber });

  // ノード詳細（コード断片・隣接ノード・リスク情報）
  const { data: nodeDetail, loading: nodeDetailLoading, error: nodeDetailError } = useNodeDetail({
    owner, repo, prNumber, nodeId: selectedNodeId
  });

  // AI解説（非同期・LLMで生成）
  const { aiExplanation, loading: explainLoading } = useNodeExplain({
    owner, repo, prNumber, nodeId: selectedNodeId
  });

  if (status === 'loading') {
    return (
      <div className="status-screen">
        <div className="spinner" />
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="status-screen">
        <div className="spinner" />
        <p>PR #{prNumber} を解析中...</p>
        <p style={{ fontSize: 12, color: '#999' }}>完了後に自動更新されます</p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="status-screen error">
        <p>データ取得に失敗しました</p>
        <p style={{ fontSize: 12 }}>{error}</p>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="status-screen">
        <p>PR #{prNumber} のデータが見つかりません</p>
        <p style={{ fontSize: 12, color: '#999' }}>
          {owner}/{repo} の解析が完了していない可能性があります
        </p>
      </div>
    );
  }

  const { prMetadata, modes } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header className="page-header">
        <h2>{prMetadata.prTitle}</h2>
        {prMetadata.prUrl && (
          <a href={prMetadata.prUrl} target="_blank" rel="noopener noreferrer">
            {prMetadata.repositoryFullName} #{prNumber}
          </a>
        )}
      </header>
      <ThreePaneLayout
        left={
          <FileTreePane
            files={prMetadata.files}
            prMetadata={prMetadata}
          />
        }
        center={
          <VisualizationPane
            modes={modes}
            activeMode={activeMode}
            onModeChange={setActiveMode}
            onNodeClick={setSelectedNodeId}
          />
        }
        right={
          <ReviewInfoPane
            modes={modes}
            selectedNodeId={selectedNodeId}
            nodeDetail={nodeDetail}
            nodeDetailLoading={nodeDetailLoading}
            nodeDetailError={nodeDetailError}
            aiExplanation={aiExplanation}
            explainLoading={explainLoading}
          />
        }
      />
    </div>
  );
}
