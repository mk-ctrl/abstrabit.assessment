import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

export default function LogsTable() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      // In Phase 5 we query execution logs.
      // We will make a GET request to the rules backend or a dedicated logs route.
      // Let's create an endpoint in rules.js or dedicated endpoint. We'll support GET /api/rules/logs.
      const response = await api.get('/rules/logs');
      setLogs(response.data.logs || []);
    } catch (err) {
      console.error('Error retrieving audit logs:', err);
      setError('Failed to load execution audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Poll logs every 15 seconds to keep the dashboard live
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 text-lg">Execution Audit Stream</h3>
          <p className="text-sm text-slate-500 mt-0.5">Real-time status of webhook events and downstream actions</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-b border-red-100 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-55/50 border-b border-slate-200 text-slate-500 font-medium select-none">
              <th className="p-4">Timestamp</th>
              <th className="p-4">Repository & Event</th>
              <th className="p-4">Action Description</th>
              <th className="p-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-8 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Clock size={24} className="text-slate-300" />
                    <span>No execution logs captured yet. Trigger some webhook events to see them here.</span>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-500 whitespace-nowrap">
                      {new Date(log.logged_at).toLocaleTimeString()} <span className="text-xs text-slate-400">({new Date(log.logged_at).toLocaleDateString()})</span>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-slate-800">
                        {log.webhook_events?.target_repository}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 capitalize bg-slate-100 px-1.5 py-0.5 rounded-full inline-block">
                        {log.webhook_events?.event_type || 'Unknown'}
                      </div>
                    </td>
                    <td className="p-4 text-slate-700 max-w-xs md:max-w-md truncate">
                      {log.action_description}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold select-none ${
                          log.is_successful
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors'
                        }`}
                      >
                        {log.is_successful ? (
                          <>
                            <CheckCircle size={12} />
                            Success
                          </>
                        ) : (
                          <>
                            <XCircle size={12} />
                            Failed
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                  {/* Expanded error trace block */}
                  {!log.is_successful && expandedLog === log.id && (
                    <tr className="bg-red-50/30">
                      <td colSpan="4" className="p-4 border-t border-b border-red-100">
                        <div className="bg-red-950 text-red-200 p-4 rounded-lg font-mono text-xs overflow-x-auto shadow-inner border border-red-900/50">
                          <div className="font-bold mb-1 text-red-400">Error Stack Trace:</div>
                          {log.captured_error_details || 'No trace captured.'}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
