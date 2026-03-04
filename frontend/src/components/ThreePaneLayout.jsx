/**
 * 3ペインレイアウトコンポーネント。
 * 左: ファイルツリー（固定240px）
 * 中央: 可視化キャンバス（可変）
 * 右: レビュー情報（固定280px）
 */
export function ThreePaneLayout({ left, center, right }) {
  return (
    <div className="three-pane-layout">
      <div className="pane pane-left">{left}</div>
      <div className="pane pane-center">{center}</div>
      <div className="pane pane-right">{right}</div>
    </div>
  );
}
