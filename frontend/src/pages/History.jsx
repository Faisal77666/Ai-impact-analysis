import { useEffect, useState } from 'react';
import { bulkDeleteHistory, deleteHistoryItem, getHistoryFiltered } from '../services/api';
import RiskBadge from '../components/RiskBadge';

const PAGE_SIZE = 15;
const INITIAL_FILTERS = {
  risk: '',
  from: '',
  to: ''
};

const extractError = (err, fallback) => err.response?.data?.message || err.response?.data?.error || err.message || fallback;

function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [confirmState, setConfirmState] = useState(null);

  const loadHistory = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await getHistoryFiltered({
        limit: PAGE_SIZE,
        skip: page * PAGE_SIZE,
        risk: filters.risk,
        from: filters.from,
        to: filters.to
      });
      setHistory(payload.history || []);
    } catch (err) {
      setError(extractError(err, 'Failed to load history.'));
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    setSelectedIds([]);
  }, [page, filters]);

  const toggleSelection = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectPage = () => {
    const pageIds = history.map((item) => item._id).filter(Boolean);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
  };

  const applyFilters = () => {
    setPage(0);
    setFilters({ ...draftFilters });
  };

  const clearFilters = () => {
    setDraftFilters(INITIAL_FILTERS);
    setPage(0);
    setFilters(INITIAL_FILTERS);
  };

  const runDeleteSingle = async (id) => {
    setBusy(true);
    setError('');

    try {
      await deleteHistoryItem(id);
      setHistory((prev) => prev.filter((item) => item._id !== id));
      setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
      if (history.length === 1 && page > 0) {
        setPage((p) => Math.max(0, p - 1));
      } else {
        await loadHistory();
      }
    } catch (err) {
      setError(extractError(err, 'Failed to delete history item.'));
    } finally {
      setBusy(false);
      setConfirmState(null);
    }
  };

  const runDeleteBulk = async (ids = []) => {
    setBusy(true);
    setError('');

    try {
      await bulkDeleteHistory(ids);
      setSelectedIds([]);
      if (history.length <= ids.length && page > 0) {
        setPage((p) => Math.max(0, p - 1));
      } else {
        await loadHistory();
      }
    } catch (err) {
      setError(extractError(err, 'Failed to delete selected history.'));
    } finally {
      setBusy(false);
      setConfirmState(null);
    }
  };

  const allPageSelected = history.length > 0 && history.every((item) => selectedIds.includes(item._id));
  const canGoNext = history.length === PAGE_SIZE;

  if (loading) {
    return (
      <main style={{ display: 'grid', gap: 12 }}>
        <div className="panel">
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            <div className="skeleton" style={{ width: '34%' }} />
            <div className="skeleton" style={{ width: '75%' }} />
            <div className="skeleton" style={{ width: '92%' }} />
            <div className="skeleton" style={{ width: '58%' }} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: 'grid', gap: 14 }}>
      <section className="panel">
        <div className="panel-header">History Filters</div>
        <div className="panel-body toolbar-row">
          <select
            value={draftFilters.risk}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, risk: event.target.value }))}
          >
            <option value="">All risk levels</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>

          <input
            type="date"
            value={draftFilters.from}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, from: event.target.value }))}
            aria-label="From date"
          />

          <input
            type="date"
            value={draftFilters.to}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, to: event.target.value }))}
            aria-label="To date"
          />

          <button type="button" className="button-primary" onClick={applyFilters} disabled={busy}>
            Apply Filters
          </button>
          <button type="button" className="button-muted" onClick={clearFilters} disabled={busy}>
            Reset
          </button>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel">
        <div className="panel-header meta-row">
          <span>Analysis History</span>
          <div className="chip-group">
            <span className="pill">Page: {page + 1}</span>
            <span className="pill">Rows: {history.length}</span>
            <span className="pill">Selected: {selectedIds.length}</span>
          </div>
        </div>

        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <div className="toolbar-row">
            <button type="button" className="button-muted" onClick={toggleSelectPage} disabled={!history.length || busy}>
              {allPageSelected ? 'Unselect Page' : 'Select Page'}
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={() => setConfirmState({ type: 'bulk', ids: selectedIds.slice() })}
              disabled={!selectedIds.length || busy}
            >
              Delete Selected
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={() => setConfirmState({ type: 'all' })}
              disabled={busy}
            >
              Delete All History
            </button>
          </div>

          {!history.length ? (
            <div className="empty-state">No history records found for the current filter criteria.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectPage}
                  aria-label="Select page rows"
                />
              </th>
              <th>Query</th>
              <th>Risk</th>
              <th>Assets Affected</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item._id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item._id)}
                    onChange={() => toggleSelection(item._id)}
                    aria-label={`Select ${item.queryText}`}
                  />
                </td>
                <td style={{ minWidth: 280 }}>{item.queryText}</td>
                <td><RiskBadge score={item.result?.riskScore} /></td>
                <td>{item.result?.affectedAssets?.length || 0}</td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => setConfirmState({ type: 'single', id: item._id, label: item.queryText })}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
            </div>
          )}

          <div className="meta-row">
            <div className="pagination">
              <button
                type="button"
                className="button-muted"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={page === 0 || busy}
              >
                Previous
              </button>
              <button
                type="button"
                className="button-muted"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!canGoNext || busy}
              >
                Next
              </button>
            </div>
            <span className="pill">Showing up to {PAGE_SIZE} per page</span>
          </div>
        </div>
      </section>

      {confirmState ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Confirm Deletion</h3>
            {confirmState.type === 'single' ? (
              <p>
                Delete this history item?
                <br />
                <strong>{confirmState.label}</strong>
              </p>
            ) : null}
            {confirmState.type === 'bulk' ? (
              <p>Delete {confirmState.ids?.length || 0} selected history records?</p>
            ) : null}
            {confirmState.type === 'all' ? (
              <p>Delete all history records? This action cannot be undone.</p>
            ) : null}

            <div className="toolbar-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="button-muted" onClick={() => setConfirmState(null)} disabled={busy}>
                Cancel
              </button>
              {confirmState.type === 'single' ? (
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => runDeleteSingle(confirmState.id)}
                  disabled={busy}
                >
                  {busy ? 'Deleting...' : 'Delete'}
                </button>
              ) : null}
              {confirmState.type === 'bulk' ? (
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => runDeleteBulk(confirmState.ids || [])}
                  disabled={busy}
                >
                  {busy ? 'Deleting...' : 'Delete Selected'}
                </button>
              ) : null}
              {confirmState.type === 'all' ? (
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => runDeleteBulk([])}
                  disabled={busy}
                >
                  {busy ? 'Deleting...' : 'Delete All'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default History;
