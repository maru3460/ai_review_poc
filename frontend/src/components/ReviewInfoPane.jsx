/**
 * レビュー情報ペイン（右ペイン）。
 * 3行要約・レビュー観点・リスク注釈を表示する。
 * 表示内容はモード切替に関わらず常に同じデータを参照する。
 */
export function ReviewInfoPane({ modes }) {
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
