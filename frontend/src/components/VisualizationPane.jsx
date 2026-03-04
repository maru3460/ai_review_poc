import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

const MODE_LABELS = {
  workflowChange: 'Workflow Change',
  impactMap: 'Impact Map',
  dataLineage: 'Data Lineage',
  architectureCompliance: 'Architecture',
  intentContext: 'Intent/Context',
};

const MODE_KEYS = Object.keys(MODE_LABELS);

/**
 * Mermaid IDに使えない文字を_に置換する。
 */
function sanitizeMermaidId(id) {
  return ('n_' + id).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
}

/**
 * ImpactMapデータ（impactNodes + edges）をMermaid flowchartに変換する。
 */
function impactMapToMermaid(data) {
  if (!data?.impactNodes?.length) return 'graph TD\n  NoData["データなし"]';

  const lines = ['graph TD'];
  const nodeMap = {};

  for (const node of data.impactNodes) {
    const safeId = sanitizeMermaidId(node.id);
    nodeMap[node.id] = safeId;
    const label = (node.label || node.id).slice(0, 40).replace(/"/g, "'");
    const change = node.changeType !== 'unchanged' ? `\\n[${node.changeType}]` : '';
    lines.push(`  ${safeId}["${label}${change}"]`);
  }

  for (const edge of data.edges || []) {
    const from = nodeMap[edge.from] || sanitizeMermaidId(edge.from);
    const to = nodeMap[edge.to] || sanitizeMermaidId(edge.to);
    lines.push(`  ${from} --"${edge.type}"--> ${to}`);
  }

  return lines.join('\n');
}

/**
 * DataLineageデータをMermaid flowchartに変換する。
 */
function dataLineageToMermaid(data) {
  if (!data?.lineage?.length) return 'graph TD\n  NoData["データなし"]';

  const lines = ['graph LR'];
  const nodes = new Set();

  for (const item of data.lineage) {
    const fromId = sanitizeMermaidId(item.from);
    const toId = sanitizeMermaidId(item.to);
    if (!nodes.has(fromId)) {
      nodes.add(fromId);
      lines.push(`  ${fromId}["${item.from.slice(0, 30).replace(/"/g, "'")}"]`);
    }
    if (!nodes.has(toId)) {
      nodes.add(toId);
      lines.push(`  ${toId}["${item.to.slice(0, 30).replace(/"/g, "'")}"]`);
    }
    const label = (item.dataDescription || item.type || '').slice(0, 20).replace(/"/g, "'");
    const arrow = item.hasSideEffect ? '==>' : '-->';
    lines.push(`  ${fromId} ${arrow}|"${label}"| ${toId}`);
  }

  return lines.join('\n');
}

/**
 * ArchitectureComplianceデータをMermaid flowchartに変換する。
 */
function architectureToMermaid(data) {
  if (!data?.layers?.length) return 'graph TD\n  NoData["データなし"]';

  const lines = ['graph TD'];

  for (const layer of data.layers) {
    const safeName = sanitizeMermaidId(layer.name);
    lines.push(`  subgraph ${safeName}["${layer.name}"]`);
    for (const nodeId of (layer.nodes || []).slice(0, 8)) {
      const safeId = sanitizeMermaidId(nodeId);
      lines.push(`    ${safeId}["${nodeId.slice(0, 30).replace(/"/g, "'")}"]`);
    }
    lines.push('  end');
  }

  for (const v of data.violations || []) {
    const from = sanitizeMermaidId(v.from);
    const to = sanitizeMermaidId(v.to);
    lines.push(`  ${from} -.->|"violation"| ${to}`);
  }

  return lines.join('\n');
}

/**
 * モードキーとデータからMermaid文字列を返す。
 * IntentContextはnullを返す（テキスト表示）。
 */
function getMermaidChart(modeKey, modeResult) {
  if (!modeResult?.success) return null;
  const d = modeResult.data;
  switch (modeKey) {
    case 'workflowChange':
      return d?.mermaid || null;
    case 'impactMap':
      return impactMapToMermaid(d);
    case 'dataLineage':
      return d?.mermaid || dataLineageToMermaid(d);
    case 'architectureCompliance':
      return architectureToMermaid(d);
    case 'intentContext':
      return null;
    default:
      return null;
  }
}

/**
 * Mermaidダイアグラムをレンダリングするコンポーネント。
 */
function MermaidDiagram({ chart }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !chart) return;
    let cancelled = false;

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      })
      .catch((err) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = `<pre style="color:#c62828;font-size:11px;padding:8px">Mermaid描画エラー:\n${err.message}</pre>`;
        }
      });

    return () => { cancelled = true; };
  }, [chart]);

  return <div ref={containerRef} className="mermaid-container" />;
}

/**
 * Intent/Contextモードのテキスト表示コンポーネント。
 */
function IntentContextView({ data }) {
  if (!data) return <div className="mode-failed">データなし</div>;
  const alignScore = data.alignmentScore ?? 0;

  return (
    <div className="intent-context-view">
      {data.intentCategory && (
        <span className="intent-badge">{data.intentCategory}</span>
      )}
      {data.mainPurpose && (
        <div className="intent-section">
          <h4>主な目的</h4>
          <p>{data.mainPurpose}</p>
        </div>
      )}
      {data.implementationSummary && (
        <div className="intent-section">
          <h4>実装サマリー</h4>
          <p>{data.implementationSummary}</p>
        </div>
      )}
      <div className="intent-section">
        <h4>意図との整合性 ({alignScore}/100)</h4>
        <div className="alignment-bar">
          <div className="alignment-track">
            <div
              className="alignment-fill"
              style={{
                width: `${alignScore}%`,
                background: alignScore >= 70 ? '#4caf50' : alignScore >= 40 ? '#ff9800' : '#f44336',
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: '#888' }}>{alignScore}%</span>
        </div>
      </div>
      {data.reviewFocus?.length > 0 && (
        <div className="intent-section">
          <h4>レビュー観点</h4>
          <ul className="intent-list">
            {data.reviewFocus.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
      {data.concerns?.length > 0 && (
        <div className="intent-section">
          <h4>懸念点</h4>
          <ul className="intent-list">
            {data.concerns.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * ズーム/パン操作をサポートするコンテナ。
 * マウスホイールでズーム、ドラッグでパン。
 */
function ZoomPanContainer({ children }) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * factor)),
    }));
  }, []);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX - transform.x,
      y: e.clientY - transform.y,
    };
  }, [transform.x, transform.y]);

  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const resetTransform = () => setTransform({ x: 0, y: 0, scale: 1 });
  const zoomIn = () => setTransform((p) => ({ ...p, scale: Math.min(5, p.scale * 1.2) }));
  const zoomOut = () => setTransform((p) => ({ ...p, scale: Math.max(0.1, p.scale * 0.8) }));

  return (
    <div
      className="zoom-pan-outer"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="zoom-pan-inner"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={zoomIn} title="ズームイン">+</button>
        <button className="zoom-btn" onClick={zoomOut} title="ズームアウト">−</button>
        <button className="zoom-btn" onClick={resetTransform} title="リセット" style={{ fontSize: 11 }}>⌂</button>
      </div>
    </div>
  );
}

/**
 * 可視化キャンバスペイン（中央ペイン）。
 * 5モードのタブ切替とMermaidダイアグラム描画を担当する。
 */
export function VisualizationPane({ modes, activeMode, onModeChange }) {
  const modeResult = modes?.[activeMode];
  const chart = getMermaidChart(activeMode, modeResult);
  const isIntentContext = activeMode === 'intentContext';

  return (
    <div className="visualization-pane">
      <div className="mode-tabs">
        {MODE_KEYS.map((key) => {
          const result = modes?.[key];
          const isFailed = result && !result.success;
          return (
            <button
              key={key}
              className={`mode-tab${activeMode === key ? ' active' : ''}${isFailed ? ' failed' : ''}`}
              onClick={() => onModeChange(key)}
              title={isFailed ? result.error : undefined}
            >
              {MODE_LABELS[key]}
              {isFailed && ' ✕'}
            </button>
          );
        })}
      </div>

      {!modeResult?.success ? (
        <div className="mode-failed">
          {modeResult
            ? `生成不可: ${modeResult.error}`
            : 'データ読み込み中...'}
        </div>
      ) : isIntentContext ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <IntentContextView data={modeResult.data} />
        </div>
      ) : chart ? (
        <ZoomPanContainer>
          <MermaidDiagram chart={chart} />
        </ZoomPanContainer>
      ) : (
        <div className="mode-failed">描画データなし</div>
      )}
    </div>
  );
}
