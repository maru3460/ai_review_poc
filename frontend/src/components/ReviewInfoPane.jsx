/**
 * ノード詳細セクション。
 * ノード未選択時はプレースホルダーを表示する。
 * 選択時はコード断片・リスク情報・AI解説を表示する。
 */
function NodeDetailSection({ selectedNodeId, nodeDetail, nodeDetailLoading, nodeDetailError, aiExplanation, explainLoading }) {
  if (!selectedNodeId) {
    return (
      <div className="review-section node-detail-section">
        <h4>ノード詳細</h4>
        <p className="no-data">図のノードをクリックすると詳細が表示されます</p>
      </div>
    );
  }

  return (
    <div className="review-section node-detail-section">
      <h4>ノード詳細</h4>
      <div className="node-detail-id" title={selectedNodeId}>
        {selectedNodeId.length > 50 ? `...${selectedNodeId.slice(-47)}` : selectedNodeId}
      </div>

      {nodeDetailLoading && <p className="no-data">読み込み中...</p>}

      {nodeDetailError && <p className="no-data">取得失敗: {nodeDetailError}</p>}

      {nodeDetail && (
        <>
          {nodeDetail.riskLevel && (
            <div className="node-detail-risk">
              <span className={`risk-badge ${nodeDetail.riskLevel}`}>
                {nodeDetail.riskLevel.toUpperCase()}
              </span>
              {nodeDetail.riskReason && (
                <span className="risk-text">{nodeDetail.riskReason}</span>
              )}
            </div>
          )}

          {nodeDetail.codeSnippet ? (
            <div className="node-detail-code">
              <div className="node-detail-label">コード断片</div>
              <pre className="code-snippet">{nodeDetail.codeSnippet}</pre>
            </div>
          ) : (
            <p className="no-data">コード断片なし</p>
          )}
        </>
      )}

      <div className="node-detail-ai">
        <div className="node-detail-label">AI解説</div>
        {explainLoading && <p className="no-data">AI解説を生成中...</p>}
        {!explainLoading && aiExplanation && (
          <p className="ai-explanation">{aiExplanation}</p>
        )}
        {!explainLoading && !aiExplanation && !nodeDetailLoading && (
          <p className="no-data">AI解説なし</p>
        )}
      </div>
    </div>
  );
}

/**
 * レビュー情報ペイン（右ペイン）。
 * 上部にノード詳細（選択時）、下部にPR全体の要約・レビュー観点・リスク注釈を表示する。
 */
export function ReviewInfoPane({ modes, selectedNodeId, nodeDetail, nodeDetailLoading, nodeDetailError, aiExplanation, explainLoading }) {
  const intentData = modes?.intentContext?.success ? modes.intentContext.data : null;
  const impactData = modes?.impactMap?.success ? modes.impactMap.data : null;
  const archData = modes?.architectureCompliance?.success ? modes.architectureCompliance.data : null;

  // 高リスクノードを抽出（impactMap）
  const highRiskNodes = impactData?.impactNodes?.filter((n) => n.riskLevel === 'high') ?? [];
  const mediumRiskNodes = impactData?.impactNodes?.filter((n) => n.riskLevel === 'medium') ?? [];

  // アーキテクチャ違反
  const violations = archData?.violations ?? [];

  return (
    <div className="review-info-pane">
      <div className="pane-header">
        <h3>レビュー情報</h3>
      </div>

      {/* ノード詳細（上部）*/}
      <NodeDetailSection
        selectedNodeId={selectedNodeId}
        nodeDetail={nodeDetail}
        nodeDetailLoading={nodeDetailLoading}
        nodeDetailError={nodeDetailError}
        aiExplanation={aiExplanation}
        explainLoading={explainLoading}
      />

      {/* 3行要約 */}
      <div className="review-section">
        <h4>3行要約</h4>
        {intentData ? (
          <>
            {intentData.mainPurpose && (
              <div className="summary-item">
                <div className="summary-label">目的</div>
                <div className="summary-text">{intentData.mainPurpose}</div>
              </div>
            )}
            {intentData.implementationSummary && (
              <div className="summary-item">
                <div className="summary-label">実装内容</div>
                <div className="summary-text">{intentData.implementationSummary}</div>
              </div>
            )}
            {intentData.intentCategory && (
              <div className="summary-item">
                <div className="summary-label">変更種別</div>
                <div className="summary-text">{intentData.intentCategory}</div>
              </div>
            )}
          </>
        ) : (
          <p className="no-data">Intent/Contextデータなし</p>
        )}
      </div>

      {/* レビュー観点 */}
      <div className="review-section">
        <h4>レビュー観点</h4>
        {intentData?.reviewFocus?.length > 0 ? (
          <ul className="review-focus-list">
            {intentData.reviewFocus.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="no-data">なし</p>
        )}
      </div>

      {/* リスク注釈 */}
      <div className="review-section">
        <h4>リスク注釈</h4>
        {highRiskNodes.length === 0 && mediumRiskNodes.length === 0 && violations.length === 0 ? (
          <p className="no-data">検出なし</p>
        ) : (
          <>
            {[
              { nodes: highRiskNodes, cls: 'high', label: 'HIGH' },
              { nodes: mediumRiskNodes, cls: 'medium', label: 'MED' },
            ].flatMap(({ nodes, cls, label }) =>
              nodes.map((node) => (
                <div key={`${cls}-${node.id}`} className="risk-item">
                  <span className={`risk-badge ${cls}`}>{label}</span>
                  <span className="risk-text">
                    {node.label || node.id}
                    {node.riskReason && `: ${node.riskReason}`}
                  </span>
                </div>
              ))
            )}
            {violations.map((v, i) => (
              <div key={i} className="risk-item">
                <span className="risk-badge high">違反</span>
                <span className="risk-text">{v.description || `${v.from} → ${v.to}`}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 高リスクエリア（impactMap） */}
      {impactData?.highRiskAreas?.length > 0 && (
        <div className="review-section">
          <h4>高リスクエリア</h4>
          <ul className="review-focus-list">
            {impactData.highRiskAreas.map((area, i) => (
              <li key={i}>{area}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 未関連変更（intentContext） */}
      {intentData?.unrelatedChanges?.length > 0 && (
        <div className="review-section">
          <h4>意図と無関係な変更</h4>
          <ul className="review-focus-list">
            {intentData.unrelatedChanges.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
