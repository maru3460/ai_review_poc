/**
 * ファイルステータスに対応するアイコン文字を返す。
 */
function statusIcon(status) {
  switch (status) {
    case 'added': return 'A';
    case 'removed': return 'D';
    case 'modified': return 'M';
    case 'renamed': return 'R';
    default: return '~';
  }
}

/**
 * ファイル一覧をディレクトリ単位にグルーピングする。
 */
function groupByDirectory(files) {
  const groups = {};
  for (const file of files) {
    const parts = file.filename.split('/');
    const name = parts.pop();
    const dir = parts.join('/') || '(root)';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push({ ...file, name });
  }
  return groups;
}

/**
 * 変更ファイルツリーペイン（左ペイン）。
 * PRメタ情報と変更ファイル一覧を表示する。
 */
export function FileTreePane({ files, prMetadata }) {
  const groups = groupByDirectory(files || []);
  const totalAdditions = prMetadata?.lineStats?.additions ?? 0;
  const totalDeletions = prMetadata?.lineStats?.deletions ?? 0;

  return (
    <div className="file-tree-pane">
      <div className="pane-header">
        <h3>変更ファイル</h3>
      </div>

      <div className="pr-summary">
        <div className="pr-title">{prMetadata?.prTitle || '—'}</div>
        <div className="pr-stats">
          {files?.length ?? 0} ファイル &nbsp;
          <span style={{ color: '#4ade80' }}>+{totalAdditions}</span>
          {' '}
          <span style={{ color: '#f87171' }}>-{totalDeletions}</span>
        </div>
      </div>

      {Object.entries(groups).map(([dir, dirFiles]) => (
        <div key={dir} className="dir-group">
          <div className="dir-name">{dir}</div>
          {dirFiles.map((file) => (
            <div key={file.filename} className={`file-item ${file.status}`}>
              <span className="file-status-icon">{statusIcon(file.status)}</span>
              <span className="file-name" title={file.filename}>{file.name}</span>
              <span className="file-stats">
                {file.additions > 0 && <span style={{ color: '#4ade80' }}>+{file.additions}</span>}
                {file.deletions > 0 && <span style={{ color: '#f87171' }}> -{file.deletions}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
