import React, { useState } from 'react';
import { api } from '../api.js';

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('like');
  const [loading, setLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState(null);
  const [benchmarkResponse, setBenchmarkResponse] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setErrorMsg('');
    setSearchResponse(null);
    setBenchmarkResponse(null);

    try {
      if (mode === 'benchmark') {
        const bench = await api.benchmark(query.trim());
        setBenchmarkResponse(bench);
      } else {
        const res = await api.search(query.trim(), mode);
        setSearchResponse(res);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card search-box">
      <h2>7. DBMS Keyword Search & Benchmarking</h2>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Search keyword (e.g. scheduling, algorithm, simulator)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="like">Mode: SQL LIKE (Baseline Scan)</option>
            <option value="fulltext">Mode: MySQL FULLTEXT (MATCH AGAINST)</option>
            <option value="index">Mode: Inverted Index (postings join)</option>
            <option value="benchmark">Mode: 3-Way Benchmark Comparison</option>
          </select>

          <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

      {/* Benchmark 3-Way Results */}
      {benchmarkResponse && (
        <div className="benchmark-results">
          <h3>3-Way DBMS Search Benchmark for "{benchmarkResponse.query}"</h3>
          <div className="benchmark-cards">
            <div
              className={`bench-card ${
                benchmarkResponse.comparison.fastest === 'like' ? 'card-winner' : ''
              }`}
            >
              <h4>SQL LIKE</h4>
              <div className="bench-time">{benchmarkResponse.modes.like.timeMs} ms</div>
              <div className="bench-count">{benchmarkResponse.modes.like.count} match(es)</div>
              <small>Full Table Scan</small>
            </div>

            <div
              className={`bench-card ${
                benchmarkResponse.comparison.fastest === 'fulltext' ? 'card-winner' : ''
              }`}
            >
              <h4>MySQL FULLTEXT</h4>
              <div className="bench-time">{benchmarkResponse.modes.fulltext.timeMs} ms</div>
              <div className="bench-count">{benchmarkResponse.modes.fulltext.count} match(es)</div>
              <small>MATCH ... AGAINST</small>
            </div>

            <div
              className={`bench-card ${
                benchmarkResponse.comparison.fastest === 'index' ? 'card-winner' : ''
              }`}
            >
              <h4>Inverted Index</h4>
              <div className="bench-time">{benchmarkResponse.modes.index.timeMs} ms</div>
              <div className="bench-count">{benchmarkResponse.modes.index.count} match(es)</div>
              <small>postings JOIN index_terms</small>
            </div>
          </div>

          <div className="alert alert-success benchmark-summary">
            Fastest Strategy: <strong>{benchmarkResponse.comparison.fastest.toUpperCase()}</strong>{' '}
            (<strong>{benchmarkResponse.comparison.speedupVsLike}x</strong> speedup vs baseline SQL
            LIKE).
          </div>
        </div>
      )}

      {/* Standard Single Search Results */}
      {searchResponse && (
        <div className="search-results-section">
          <div className="search-meta">
            Found <strong>{searchResponse.count}</strong> match(es) in{' '}
            <span className="timing-pill">{searchResponse.timeMs} ms</span> using mode{' '}
            <code>{searchResponse.mode}</code>.
          </div>

          {searchResponse.results.length === 0 ? (
            <p className="empty-text">No matches found for "{searchResponse.query}".</p>
          ) : (
            <div className="results-list">
              {searchResponse.results.map((item) => (
                <div key={item.id} className="search-result-item">
                  <div className="result-header">
                    <span className="result-name">📄 {item.name}</span>
                    <span className="result-size">{(item.size_bytes / 1024).toFixed(1)} KB</span>
                    {item.matchedIn?.length > 0 && (
                      <span className="badge badge-info">
                        Matched in: {item.matchedIn.join(' and ')}
                      </span>
                    )}
                    {item.tf && <span className="badge badge-info">TF: {item.tf}</span>}
                    {item.score && <span className="badge badge-info">Score: {item.score}</span>}
                  </div>
                  <div className="result-snippet">
                    <em>"{item.snippet}"</em>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
