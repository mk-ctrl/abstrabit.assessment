import React, { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import { Shield, ArrowRight, Zap, RefreshCw, Layers } from 'lucide-react';
import { Github } from './components/BrandIcons';

export default function App() {
  const { isAuthenticated, login, loading } = useAuth();
  const [errorMsg, setErrorMsg] = useState(null);

  // Check for callback or errors in URL query parameters on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const path = window.location.pathname;

    // Handle OAuth Callback Redirection
    if (path.includes('/auth-callback') || searchParams.has('token')) {
      const token = searchParams.get('token');
      const username = searchParams.get('username');
      const userId = searchParams.get('github_user_id');

      if (token && username && userId) {
        login(token, username, userId);
        // Clear query parameters from URL bar
        window.history.replaceState({}, document.title, '/');
      } else {
        setErrorMsg('Authentication payload is invalid or corrupted.');
      }
    }

    // Handle OAuth callback error redirection
    if (path.includes('/auth-error') || searchParams.has('error')) {
      const err = searchParams.get('error') || 'Unknown OAuth connection error occurred.';
      setErrorMsg(decodeURIComponent(err));
      window.history.replaceState({}, document.title, '/');
    }
  }, [login]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-slate-500" size={32} />
          <span className="text-slate-500 font-medium text-sm">Validating workspace sessions...</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Dashboard />;
  }

  const BACKEND_URL = import.meta.env.VITE_API_URL 
    ? import.meta.env.VITE_API_URL.replace('/api', '') 
    : undefined; // 'http://localhost:3000';
  const authorizeUrl = `${BACKEND_URL}/api/auth/github`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {/* Landing Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-slate-900 text-white p-1.5 rounded-lg">
              <Shield size={18} />
            </div>
            <span className="font-bold text-slate-900 text-base tracking-tight">Antigravity Bot Console</span>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Build v1.0.0 (Decoupled Monorepo)
          </div>
        </div>
      </header>

      {/* Main Hero Console */}
      <main className="flex-grow flex items-center justify-center px-4 py-16">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          
          {/* Information & Features side */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-150 rounded-full text-indigo-700 text-xs font-semibold select-none">
              <Zap size={12} />
              100% Free Tiers & Event Driven
            </div>
            <h1 className="text-4xl font-extrabold text-slate-950 tracking-tight leading-tight">
              High-Reliability GitHub Automation.
            </h1>
            <p className="text-slate-500 text-base leading-relaxed">
              An enterprise-grade, event-driven assistant that manages label assignment, custom issues responses, and Slack telemetry alerts in real-time.
            </p>

            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <div className="bg-white border border-slate-200 p-2 rounded-lg text-slate-600 shadow-sm mt-0.5">
                  <Layers size={16} />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">Decoupled Queue Architecture</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Verified webhooks are instantly offloaded to a BullMQ task queue in under 50ms, eliminating connection timeouts.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-white border border-slate-200 p-2 rounded-lg text-slate-600 shadow-sm mt-0.5">
                  <Shield size={16} />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">Postgres Idempotency Guarantee</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Unique delivery tokens prevent event duplication, preventing webhook retry storms and preserving free API limits.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Login Action box */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg space-y-6 flex flex-col justify-between">
            <div className="text-center space-y-2">
              <h3 className="font-bold text-slate-900 text-xl">Sign in to console</h3>
              <p className="text-xs text-slate-400">Authorize the bot control panel to view and link your active repositories</p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-150 text-red-700 text-xs rounded-lg text-center leading-normal">
                <strong>Connection Error:</strong> {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <a
                href={authorizeUrl}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 hover:shadow-md cursor-pointer"
              >
                <Github size={18} />
                <span>Connect with GitHub</span>
                <ArrowRight size={14} className="opacity-60" />
              </a>
              <div className="text-[10px] text-center text-slate-400 leading-normal px-4">
                By connecting, you grant permission to modify issue scopes and register webhook events on selected repositories.
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Antigravity Systems. Released under MIT assessment license.
        </div>
      </footer>
    </div>
  );
}
