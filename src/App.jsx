import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Empresas from '@/pages/Empresas';
import UploadSimples from '@/pages/UploadSimples';
import HistoricoApuracoes from '@/pages/HistoricoApuracoes';
import UploadLucroPresumido from '@/pages/UploadLucroPresumido';
import DashboardLucroPresumido from '@/pages/DashboardLucroPresumido';
import HistoricoLucroPresumido from '@/pages/HistoricoLucroPresumido';
import DashboardLucroReal from '@/pages/DashboardLucroReal';
import UploadLucroReal from '@/pages/UploadLucroReal';
import HistoricoLucroReal from '@/pages/HistoricoLucroReal';
import DashboardPublico from '@/pages/DashboardPublico';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Rota pública de compartilhamento: acessível sem login, sem menu e sem outras empresas.
  // Ignora completamente o fluxo de autenticação do restante do app.
  if (window.location.pathname.startsWith('/dashboard-publico/')) {
    return (
      <Routes>
        <Route path="/dashboard-publico/:token" element={<DashboardPublico />} />
      </Routes>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/simples-nacional/upload" element={<UploadSimples />} />
        <Route path="/simples-nacional/historico" element={<HistoricoApuracoes />} />
        <Route path="/lucro-presumido/dashboard" element={<DashboardLucroPresumido />} />
        <Route path="/lucro-presumido/upload" element={<UploadLucroPresumido />} />
        <Route path="/lucro-presumido/historico" element={<HistoricoLucroPresumido />} />
        <Route path="/lucro-real/dashboard" element={<DashboardLucroReal />} />
        <Route path="/lucro-real/upload" element={<UploadLucroReal />} />
        <Route path="/lucro-real/historico" element={<HistoricoLucroReal />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App