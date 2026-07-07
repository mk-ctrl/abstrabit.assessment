import React, { useState } from 'react';
import api from '../services/api';
import { Plus, Info, Check } from 'lucide-react';

export default function RuleForm({ connections, onRuleCreated }) {
  const [repoId, setRepoId] = useState('');
  const [eventScopes, setEventScopes] = useState(['issues']);
  const [keyword, setKeyword] = useState('');
  const [label, setLabel] = useState('');
  const [commentTemplate, setCommentTemplate] = useState('');
  const [aiCategory, setAiCategory] = useState('any');
  const [aiPriority, setAiPriority] = useState('any');
  const [sendSlack, setSendSlack] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleScopeChange = (scope) => {
    setEventScopes(prev => 
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!repoId) {
      setError('Repository selection is required.');
      return;
    }

    if (eventScopes.length === 0) {
      setError('Please select at least one Event Scope.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await api.post('/rules', {
        repository_id: repoId,
        github_event_scopes: eventScopes,
        matching_keyword: keyword,
        assigned_label: label,
        comment_template: commentTemplate,
        ai_category: aiCategory,
        ai_priority: aiPriority,
        send_slack_notification: sendSlack,
      });

      setSuccess(true);
      setKeyword('');
      setLabel('');
      setCommentTemplate('');
      setAiCategory('any');
      setAiPriority('any');
      setSendSlack(false);
      
      // Trigger update of sibling rules list
      if (onRuleCreated) onRuleCreated();

      // Reset success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error creating custom rule:', err);
      setError(err.response?.data?.error || 'Failed to create custom automation rule.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="font-semibold text-slate-800 text-lg mb-1">Create Automation Rule</h3>
      <p className="text-sm text-slate-500 mb-5">Define active event scope evaluations and downstream responses</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100 flex items-center gap-1.5 font-medium">
            <Check size={16} />
            <span>Automation rule successfully created and enabled!</span>
          </div>
        )}

        {/* Repository Selection */}
        <div>
          <label htmlFor="repo-select" className="block text-sm font-medium text-slate-700 mb-1.5">
            Select Connected Repository *
          </label>
          <select
            id="repo-select"
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">-- Choose Repository --</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.repository_full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Grid layout for Event Scope and Keyword */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Event Scope */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Event Scope(s) *
            </label>
            <div className="flex flex-col gap-2 border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              {[
                { id: 'issues', label: 'Issues' },
                { id: 'pull_request', label: 'Pull Requests' },
                { id: 'push', label: 'Pushes' }
              ].map(scope => (
                <label key={scope.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eventScopes.includes(scope.id)}
                    onChange={() => handleScopeChange(scope.id)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700">{scope.label}</span>
                </label>
              ))}
            </div>
            {eventScopes.includes('push') && (
              <p className="mt-2 text-[10px] text-slate-500 italic">
                Note: Labels and Comments are ignored for Pushes.
              </p>
            )}
          </div>

          {/* Matching Keyword */}
          <div>
            <label htmlFor="keyword-input" className="block text-sm font-medium text-slate-700 mb-1.5">
              Matching Keyword <span className="text-xs text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              id="keyword-input"
              type="text"
              placeholder="e.g., bug, frontend, security"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        {/* AI Conditions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">AI Category Match</label>
            <select value={aiCategory} onChange={(e) => setAiCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="any">Any Category</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="documentation">Documentation</option>
              <option value="refactoring">Refactoring</option>
              <option value="support">Support</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">AI Priority Match</label>
            <select value={aiPriority} onChange={(e) => setAiPriority(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="any">Any Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* Assigned Label */}
        <div>
          <label htmlFor="label-input" className="block text-sm font-medium text-slate-700 mb-1.5">
            Auto-Assign GitHub Label <span className="text-xs text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            id="label-input"
            type="text"
            placeholder="e.g., triaged, priority-high"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>

        {/* Comment Template */}
        <div>
          <label htmlFor="comment-textarea" className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
            Auto-Reply Comment Template <span className="text-xs text-slate-400 font-normal">(Optional)</span>
            <span className="group relative cursor-pointer text-slate-400 hover:text-slate-600">
              <Info size={14} />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 text-white text-[11px] p-2 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity font-normal leading-normal z-10">
                Variables: {'{keyword}'}, {'{aiCategory}'}, {'{aiPriority}'}, {'{summary}'}
              </span>
            </span>
          </label>
          <textarea
            id="comment-textarea"
            rows="3"
            placeholder="e.g., Thanks for opening this issue! We've classified this as {aiCategory}."
            value={commentTemplate}
            onChange={(e) => setCommentTemplate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
          />
        </div>

        {/* Slack Notification Checkbox */}
        <div className="flex items-center gap-2 mt-4 mb-2">
          <input
            type="checkbox"
            id="slack-checkbox"
            checked={sendSlack}
            onChange={(e) => setSendSlack(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="slack-checkbox" className="text-sm font-medium text-slate-700">
            Send Slack Notification
          </label>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 px-4 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={16} />
          {loading ? 'Creating...' : 'Create Automation Rule'}
        </button>
      </form>
    </div>
  );
}
