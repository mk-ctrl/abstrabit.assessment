import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import RuleForm from './RuleForm';
import LogsTable from './LogsTable';
import { 
  Settings, Trash2, Shield, Play, 
  ExternalLink, LogOut, CheckCircle, AlertTriangle, Loader2 
} from 'lucide-react';
import { Github, Slack } from './BrandIcons';

export default function Dashboard() {
  const { username, logout } = useAuth();
  
  // States
  const [gitRepos, setGitRepos] = useState([]);
  const [connections, setConnections] = useState([]);
  const [rules, setRules] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingConns, setLoadingConns] = useState(false);
  const [loadingRules, setLoadingRules] = useState(false);
  const [connectingRepo, setConnectingRepo] = useState(null);
  const [disconnectingRepo, setDisconnectingRepo] = useState(null);
  
  // Slack configuration state
  const [slackEndpoints, setSlackEndpoints] = useState({});
  const [savingSlack, setSavingSlack] = useState({});

  // Reload triggers
  const fetchConnections = async () => {
    setLoadingConns(true);
    try {
      const response = await api.get('/rules/connections');
      setConnections(response.data.connections || []);
      
      // Initialize slack endpoints values state
      const slackMap = {};
      response.data.connections.forEach(conn => {
        slackMap[conn.id] = conn.slack_webhook_endpoint || '';
      });
      setSlackEndpoints(slackMap);
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
      setLoadingConns(false);
    }
  };

  const fetchGithubRepos = async () => {
    setLoadingRepos(true);
    try {
      const response = await api.get('/auth/repos');
      setGitRepos(response.data.repositories || []);
    } catch (err) {
      console.error('Failed to load GitHub repositories:', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  const fetchRules = async () => {
    setLoadingRules(true);
    try {
      const response = await api.get('/rules');
      setRules(response.data.rules || []);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchGithubRepos();
    fetchRules();
  }, []);

  // Action: Connect a repository (creates webhook + db entry)
  const handleConnectRepo = async (repoName) => {
    setConnectingRepo(repoName);
    try {
      await api.post('/rules/connect', { repository_full_name: repoName });
      await fetchConnections();
      await fetchRules();
    } catch (err) {
      console.error('Error connecting repo:', err);
      alert(err.response?.data?.error || 'Failed to connect repository.');
    } finally {
      setConnectingRepo(null);
    }
  };

  // Action: Disconnect a repository (deletes webhook + db entry)
  const handleDisconnectRepo = async (connId, repoName) => {
    if (!window.confirm(`Are you sure you want to disconnect ${repoName}? This will also delete all associated automation rules and webhooks.`)) {
      return;
    }
    setDisconnectingRepo(connId);
    try {
      await api.delete(`/rules/connections/${connId}`);
      await fetchConnections();
      await fetchGithubRepos();
      await fetchRules();
    } catch (err) {
      console.error('Error disconnecting repo:', err);
      alert('Failed to disconnect repository.');
    } finally {
      setDisconnectingRepo(null);
    }
  };

  // Action: Save Slack webhook URL
  const handleSaveSlack = async (connId, silent = false) => {
    setSavingSlack(prev => ({ ...prev, [connId]: true }));
    try {
      await api.put('/rules/connect/slack', {
        repository_id: connId,
        slack_webhook_endpoint: slackEndpoints[connId],
      });
      if (!silent) alert('Slack webhook updated successfully!');
      await fetchConnections();
    } catch (err) {
      console.error('Error saving slack endpoint:', err);
      if (!silent) alert('Failed to save Slack webhook URL.');
    } finally {
      setSavingSlack(prev => ({ ...prev, [connId]: false }));
    }
  };

  // Action: Toggle Rule Enabled/Disabled
  const handleToggleRule = async (ruleId, currentStatus) => {
    try {
      await api.put(`/rules/${ruleId}`, { is_enabled: !currentStatus });
      fetchRules();
    } catch (err) {
      console.error('Error toggling rule status:', err);
    }
  };

  // Action: Delete Custom Rule
  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Delete this automation rule?')) return;
    try {
      await api.delete(`/rules/${ruleId}`);
      fetchRules();
    } catch (err) {
      console.error('Error deleting rule:', err);
    }
  };

  // Filter out repositories that are already connected
  const unconnectedRepos = gitRepos.filter(
    (repo) => !connections.some((c) => c.repository_full_name === repo.full_name)
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-slate-900 text-white p-1.5 rounded-lg">
              <Shield size={20} />
            </div>
            <span className="font-bold text-slate-900 text-lg tracking-tight">Antigravity Bot Console</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-sm font-medium text-slate-600">
              <Github size={16} />
              <span>{username}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main dashboard content container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Connection Panel */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Active Connections Panel */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-lg mb-1">Active Connected Repositories</h3>
              <p className="text-sm text-slate-500 mb-5">Repositories reporting live webhooks and receiving automation dispatches</p>
              
              {loadingConns ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-slate-400" />
                </div>
              ) : connections.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
                  No repositories connected yet. Select a repository on the right to register live webhooks.
                </div>
              ) : (
                <div className="space-y-4">
                  {connections.map((conn) => (
                    <div key={conn.id} className="p-4 border border-slate-100 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{conn.repository_full_name}</span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200 uppercase">
                            Webhook Active
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Slack size={14} className="text-slate-400" />
                          <input
                            type="text"
                            placeholder="Paste Slack incoming webhook URL here"
                            value={slackEndpoints[conn.id] || ''}
                            onChange={(e) => setSlackEndpoints({ ...slackEndpoints, [conn.id]: e.target.value })}
                            onBlur={() => handleSaveSlack(conn.id, true)}
                            className="text-xs px-2 py-1 w-64 md:w-80 border border-slate-350 rounded focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                          />
                          <button
                            onClick={() => handleSaveSlack(conn.id)}
                            disabled={savingSlack[conn.id]}
                            className="bg-indigo-650 hover:bg-indigo-700 text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded text-xs font-semibold hover:bg-indigo-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {savingSlack[conn.id] ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDisconnectRepo(conn.id, conn.repository_full_name)}
                        disabled={disconnectingRepo === conn.id}
                        className="self-end md:self-center flex items-center justify-center p-2 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Unconnected Github repositories */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-lg mb-1">Connect Repositories</h3>
              <p className="text-sm text-slate-500 mb-4">Select a repository from your GitHub profile to install webhooks</p>
              
              <div className="overflow-y-auto max-h-[220px] divide-y divide-slate-100 pr-1">
                {loadingRepos ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-slate-400" />
                  </div>
                ) : unconnectedRepos.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    All repositories are connected or no active repositories were found on your account.
                  </div>
                ) : (
                  unconnectedRepos.map((repo) => (
                    <div key={repo.id} className="py-2.5 flex items-center justify-between text-sm gap-2">
                      <div className="truncate font-medium text-slate-700 hover:text-indigo-600 transition-colors">
                        <a href={repo.html_url} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                          {repo.full_name}
                          <ExternalLink size={12} className="opacity-50" />
                        </a>
                      </div>
                      <button
                        onClick={() => handleConnectRepo(repo.full_name)}
                        disabled={connectingRepo !== null}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors disabled:opacity-50"
                      >
                        {connectingRepo === repo.full_name ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </section>

        {/* Rules Console */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Rule list console */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 text-lg mb-1">Active Rules List</h3>
            <p className="text-sm text-slate-500 mb-5">Currently matching conditions and responses</p>

            {loadingRules ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-slate-400" />
              </div>
            ) : rules.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
                No custom evaluation rules configured. Add a rule using the console on the right.
              </div>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div key={rule.id} className={`p-4 border rounded-lg transition-colors flex items-start justify-between gap-4 ${
                    rule.is_enabled ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-100/30 border-slate-200 opacity-60'
                  }`}>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs">
                          {rule.connected_repositories?.repository_full_name}
                        </span>
                        <span className="capitalize text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 px-1.5 py-0.5 rounded">
                          {rule.github_event_scope.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-500">
                          Keyword: <strong className="text-slate-800 font-mono">"{rule.matching_keyword}"</strong>
                        </span>
                      </div>
                      
                      {/* Displays actions */}
                      <div className="text-xs text-slate-600 space-y-1">
                        {rule.assigned_label && (
                          <div>
                            Assign GitHub Label: <span className="bg-slate-100 px-1 rounded font-semibold text-slate-700">{rule.assigned_label}</span>
                          </div>
                        )}
                        {rule.comment_template && (
                          <div className="truncate max-w-lg">
                            Reply Template: <span className="font-mono bg-slate-50 text-[10px] text-slate-600 px-1 border rounded">{rule.comment_template}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                      {/* Enable/Disable Switch */}
                      <button
                        onClick={() => handleToggleRule(rule.id, rule.is_enabled)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                          rule.is_enabled ? 'bg-slate-900 flex justify-end' : 'bg-slate-350 flex justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create custom rules form */}
          <div>
            <RuleForm connections={connections} onRuleCreated={fetchRules} />
          </div>
        </section>

        {/* Embedded real-time Logs table */}
        <section>
          <LogsTable />
        </section>
      </main>
    </div>
  );
}
