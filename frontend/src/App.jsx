import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PRVisualizationPage } from './pages/PRVisualizationPage';

function NotFound() {
  return (
    <div className="status-screen">
      <h2>ページが見つかりません</h2>
      <p>
        可視化ページには <code>/prs/:owner/:repo/:prNumber</code> でアクセスしてください
      </p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/prs/:owner/:repo/:prNumber" element={<PRVisualizationPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
