import { HashRouter as Router, Routes, Route, Outlet, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectRunsPage } from './pages/ProjectRunsPage';
import { FeatureDetailPage } from './pages/FeatureDetailPage';
import { SuiteRunsPage } from './pages/SuiteRunsPage';
import { SuiteRunDetailPage } from './pages/SuiteRunDetailPage';
import { FeatureRunDetailPage } from './pages/FeatureRunDetailPage';
import { TestCaseRunDetailPage } from './pages/TestCaseRunDetailPage';
import { TestProposalPreviewPage } from './pages/TestProposalPreviewPage';
import { TestRunPage } from './pages/TestRunPage';
import { TestRunLivePage } from './pages/TestRunLivePage';
import { LaunchConfigListPage } from './pages/LaunchConfigListPage';
import { LaunchConfigFormPage } from './pages/LaunchConfigFormPage';
import { ProjectProvider } from './contexts/ProjectContext';

const ProjectRouteWrapper = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <ProjectProvider projectId={id}>
      <Outlet />
    </ProjectProvider>
  );
};

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />

          {/* Project routes wrapped in Provider */}
          <Route path="/projects/:id" element={<ProjectRouteWrapper />}>
            <Route index element={<ProjectDetailPage />} />
            <Route path="launch-configs" element={<LaunchConfigListPage />} />
            <Route path="launch-configs/new" element={<LaunchConfigFormPage />} />
            <Route path="launch-configs/:configId/edit" element={<LaunchConfigFormPage />} />
            <Route path="analyze" element={<TestProposalPreviewPage />} />
            <Route path="run" element={<TestRunPage />} />
            <Route path="runs" element={<ProjectRunsPage />} />
          </Route>

          <Route path="/features/:id" element={<FeatureDetailPage />} />
          <Route path="/suite-runs" element={<SuiteRunsPage />} />
          <Route path="/suite-runs/:id" element={<SuiteRunDetailPage />} />
          <Route path="/feature-runs/:id" element={<FeatureRunDetailPage />} />
          <Route path="/test-case-runs/:id" element={<TestCaseRunDetailPage />} />
          {/* Note: test-runs/:id might need project context if it needs to load project. Assume yes for now or leave independent if it just needs run ID. Leaving independent to avoid breaking if project ID not in URL. */}
          <Route path="/test-runs/:id" element={<TestRunLivePage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;

