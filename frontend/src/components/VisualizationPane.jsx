import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

// Mermaid click DSL から呼ばれるグローバルコールバック。
// VisualizationPane の onNodeClick を登録・解除して使う。
let _globalNodeClickCallback = null;
window.__mermaidNodeClick__ = (rawId) => {
  if (_globalNodeClickCallback) _globalNodeClickCallback(rawId);
};

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
 * changeType（added/modified/deleted）をclassDefで色分けする。
 */
function impactMapToMermaid(data) {
  if (!data?.impactNodes?.length) return 'graph TD\n  NoData["データなし"]';

  const lines = [
    'graph TD',
    '  classDef added fill:#c8e6c9,stroke:#388e3c,color:#1b5e20',
    '  classDef modified fill:#fff3e0,stroke:#f57c00,color:#bf360c',
    '  classDef deleted fill:#ffcdd2,stroke:#c62828,color:#b71c1c',
  ];
  const nodeMap = {};

  for (const node of data.impactNodes) {
    const safeId = sanitizeMermaidId(node.id);
    nodeMap[node.id] = safeId;
    const label = (node.label || node.id).slice(0, 40).replace(/"/g, "'");
    const change = node.changeType !== 'unchanged' ? `\\n[${node.changeType}]` : '';
    const styleClass = node.changeType !== 'unchanged' ? `:::${node.changeType}` : '';
    lines.push(`  ${safeId}["${label}${change}"]${styleClass}`);
    // tooltip にオリジナルIDを渡すことで、コールバックから直接 /nodes?id= に使える
    const tooltipId = node.id.replace(/"/g, "'");
    lines.push(`  click ${safeId} __mermaidNodeClick__ "${tooltipId}"`);
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
  const nodes = new Map(); // safeId -> originalId

  for (const item of data.lineage) {
    const fromId = sanitizeMermaidId(item.from);
    const toId = sanitizeMermaidId(item.to);
    if (!nodes.has(fromId)) {
      nodes.set(fromId, item.from);
      lines.push(`  ${fromId}["${item.from.slice(0, 30).replace(/"/g, "'")}"]`);
    }
    if (!nodes.has(toId)) {
      nodes.set(toId, item.to);
      lines.push(`  ${toId}["${item.to.slice(0, 30).replace(/"/g, "'")}"]`);
    }
    const label = (item.dataDescription || item.type || '').slice(0, 20).replace(/"/g, "'");
    const arrow = item.hasSideEffect ? '==>' : '-->';
    lines.push(`  ${fromId} ${arrow}|"${label}"| ${toId}`);
  }

  for (const [safeId, originalId] of nodes) {
    lines.push(`  click ${safeId} __mermaidNodeClick__ "${originalId.replace(/"/g, "'")}"`);
  }

  return lines.join('\n');
}

/**
 * ArchitectureComplianceデータをMermaid flowchartに変換する。
 */
function architectureToMermaid(data) {
  if (!data?.layers?.length) return 'graph TD\n  NoData["データなし"]';

  const lines = ['graph TD'];
  const nodeMap = new Map(); // safeId -> originalId

  for (const layer of data.layers) {
    const safeName = sanitizeMermaidId(layer.name);
    lines.push(`  subgraph ${safeName}["${layer.name}"]`);
    for (const nodeId of (layer.nodes || []).slice(0, 8)) {
      const safeId = sanitizeMermaidId(nodeId);
      nodeMap.set(safeId, nodeId);
      lines.push(`    ${safeId}["${nodeId.slice(0, 30).replace(/"/g, "'")}"]`);
    }
    lines.push('  end');
  }

  for (const v of data.violations || []) {
    const from = sanitizeMermaidId(v.from);
    const to = sanitizeMermaidId(v.to);
    lines.push(`  ${from} -.->|"violation"| ${to}`);
  }

  for (const [safeId, originalId] of nodeMap) {
    lines.push(`  click ${safeId} __mermaidNodeClick__ "${originalId.replace(/"/g, "'")}"`);
  }

  return lines.join('\n');
}

/**
 * LLM生成のMermaid文字列にクリックイベントを注入する。
 * workflowChangeモード向け。ノードIDは静的解析IDと一致しない場合があり、
 * その場合は詳細パネルにフォールバック表示がされる。
 */
function injectMermaidClicks(mermaidStr) {
  if (!mermaidStr) return mermaidStr;

  const keywords = new Set(['graph', 'flowchart', 'subgraph', 'end', 'click', 'classDef', 'class', 'style', 'linkStyle', 'direction']);
  const nodeIds = new Set();

  for (const line of mermaidStr.split('\n')) {
    const m = line.match(/^\s+([A-Za-z0-9_]+)[\[\(\{]/);
    if (m && !keywords.has(m[1])) {
      nodeIds.add(m[1]);
    }
  }

  if (nodeIds.size === 0) return mermaidStr;

  const clickLines = Array.from(nodeIds).map((id) => `  click ${id} __mermaidNodeClick__ "${id}"`);
  return mermaidStr + '\n' + clickLines.join('\n');
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
      return d?.mermaid ? injectMermaidClicks(d.mermaid) : null;
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
 * transform と onTransformChange を外部から受け取るコントロールドコンポーネント。
 */
function ZoomPanContainer({ children, transform, onTransformChange }) {
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    onTransformChange((prev) => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * factor)),
    }));
  }, [onTransformChange]);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = { x: e.clientX, y: e.clientY };
    onTransformChange((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, [onTransformChange]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const resetTransform = useCallback(() => onTransformChange({ x: 0, y: 0, scale: 1 }), [onTransformChange]);
  const zoomIn = useCallback(() => onTransformChange((prev) => ({ ...prev, scale: Math.min(5, prev.scale * 1.2) })), [onTransformChange]);
  const zoomOut = useCallback(() => onTransformChange((prev) => ({ ...prev, scale: Math.max(0.1, prev.scale * 0.8) })), [onTransformChange]);

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
 * モード別にZoomPan状態を保持し、タブ切替後も位置・ズームが維持される。
 * onNodeClick を受け取り、impactMap のノードクリック時に呼び出す。
 */
export function VisualizationPane({ modes, activeMode, onModeChange, onNodeClick }) {
  const [transforms, setTransforms] = useState(
    () => Object.fromEntries(MODE_KEYS.map((k) => [k, { x: 0, y: 0, scale: 1 }]))
  );
  const tabRefs = useRef({});

  // グローバルコールバックを最新の onNodeClick に同期する
  useEffect(() => {
    _globalNodeClickCallback = onNodeClick || null;
    return () => {
      // 自分が登録したコールバックのみ解除する（複数インスタンス対策）
      if (_globalNodeClickCallback === onNodeClick) {
        _globalNodeClickCallback = null;
      }
    };
  }, [onNodeClick]);

  const handleTransformChange = useCallback((updater) => {
    setTransforms((prev) => ({
      ...prev,
      [activeMode]: typeof updater === 'function' ? updater(prev[activeMode]) : updater,
    }));
  }, [activeMode]);

  const handleTabKeyDown = useCallback((e, currentKey) => {
    const currentIdx = MODE_KEYS.indexOf(currentKey);
    let nextKey = null;
    if (e.key === 'ArrowRight') {
      nextKey = MODE_KEYS[(currentIdx + 1) % MODE_KEYS.length];
    } else if (e.key === 'ArrowLeft') {
      nextKey = MODE_KEYS[(currentIdx - 1 + MODE_KEYS.length) % MODE_KEYS.length];
    }
    if (nextKey) {
      e.preventDefault();
      onModeChange(nextKey);
      tabRefs.current[nextKey]?.focus();
    }
  }, [onModeChange]);

  const modeResult = modes?.[activeMode];
  const chart = getMermaidChart(activeMode, modeResult);
  const isIntentContext = activeMode === 'intentContext';

  return (
    <div className="visualization-pane">
      <div className="mode-tabs" role="tablist">
        {MODE_KEYS.map((key) => {
          const result = modes?.[key];
          const isFailed = result && !result.success;
          return (
            <button
              key={key}
              ref={(el) => { tabRefs.current[key] = el; }}
              role="tab"
              aria-selected={activeMode === key}
              className={`mode-tab${activeMode === key ? ' active' : ''}${isFailed ? ' failed' : ''}`}
              onClick={() => onModeChange(key)}
              onKeyDown={(e) => handleTabKeyDown(e, key)}
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
        <ZoomPanContainer
          transform={transforms[activeMode]}
          onTransformChange={handleTransformChange}
        >
          <MermaidDiagram chart={chart} />
        </ZoomPanContainer>
      ) : (
        <div className="mode-failed">描画データなし</div>
      )}
    </div>
  );
}
