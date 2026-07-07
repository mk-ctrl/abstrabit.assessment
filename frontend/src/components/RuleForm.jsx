import React, { useState } from 'react';
import api from '../services/api';
import { Plus, Info, Check } from 'lucide-react';

export default function RuleForm({ connections, onRuleCreated }) {
  const [repoId, setRepoId] = useState('');
  const [eventScope, setEventScope] = useState('issues');
  const [keyword, setKeyword] = useState('');
  const [label, setLabel] = useState('');
  const [commentTemplate, setCommentTemplate] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!repoId || !keyword) {
      setError('Repository selection and matching keyword are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await api.post('/rules', {
        repository_id: repoId,
        github_event_scope: eventScope,
        matching_keyword: keyword,
        assigned_label: label,
        comment_template: commentTemplate,
      });

      setSuccess(true);
      setKeyword('');
      setLabel('');
      setCommentTemplate('');
      
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
            <label htmlFor="scope-select" className="block text-sm font-medium text-slate-700 mb-1.5">
              Event Scope *
            </label>
            <select
              id="scope-select"
              value={eventScope}
              onChange={(e) => setEventScope(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="issues">Issues</option>
              <option value="pull_request">Pull Requests</option>
              <option value="push">Pushes</option>
            </select>
          </div>

          {/* Matching Keyword */}
          <div>
            <label htmlFor="keyword-input" className="block text-sm font-medium text-slate-700 mb-1.5">
              Matching Keyword *
            </label>
            <input
              id="keyword-input"
              type="text"
              placeholder="e.g., bug, frontend, security"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
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
                Markdown supported. Leave blank if you do not want to reply.
              </span>
            </span>
          </label>
          <textarea
            id="comment-textarea"
            rows="3"
            placeholder="e.g., Thank you for opening this issue. Our team is investigating the keywords: {keyword}..."
            value={commentTemplate}
            onChange={(e) => setCommentTemplate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-xs"
          />
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
