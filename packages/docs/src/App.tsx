import { Route, Routes } from "react-router";

import { DocsLayout } from "./components/DocsLayout";
import { ApiOverview } from "./routes/ApiOverview";
import { ApiPage } from "./routes/ApiPage";
import { GettingStarted } from "./routes/GettingStarted";
import { HomePage } from "./routes/HomePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/docs" element={<DocsLayout />}>
        <Route index element={<GettingStarted />} />
        <Route path="getting-started" element={<GettingStarted />} />
        <Route path="api" element={<ApiOverview />} />
        <Route path="api/*" element={<ApiPage />} />
      </Route>
    </Routes>
  );
}

