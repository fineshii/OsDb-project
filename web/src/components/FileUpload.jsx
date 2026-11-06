import React, { useState, useRef } from 'react';
import { api } from '../api.js';

export function FileUpload({ files, onFilesUploaded, selectedFileIds, onSelectionChange }) {
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const data = await api.uploadFiles(fileList);
      setSuccessMsg(data.message || 'Files uploaded successfully');
      onFilesUploaded();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      if (err.status === 409) {
        setErrorMsg(`Duplicate Detected (HTTP 409): ${err.message}`);
      } else {
        setErrorMsg(`Upload Failed: ${err.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const toggleSelect = (id) => {
    if (selectedFileIds.includes(id)) {
      onSelectionChange(selectedFileIds.filter((fid) => fid !== id));
    } else {
      onSelectionChange([...selectedFileIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedFileIds.length === files.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(files.map((f) => f.id));
    }
  };

  return (
    <div className="card file-upload">
      <h2>3. File Upload & Storage</h2>

      <div
        className={`drop-zone ${isDragging ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)}
        />
        <p>
          {uploading
            ? 'Uploading and computing SHA-256 hashes...'
            : 'Drag & Drop files here, or click to browse'}
        </p>
        <span className="hint-text">Text files only (size limit: 10MB per file)</span>
      </div>

      {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div className="file-list-section">
        <div className="section-header">
          <h3>Stored Files in MySQL ({files.length})</h3>
          {files.length > 0 && (
            <button className="btn btn-sm" onClick={selectAll}>
              {selectedFileIds.length === files.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {files.length === 0 ? (
          <p className="empty-text">No files stored in MySQL database yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th width="40">Select</th>
                  <th>ID</th>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className={selectedFileIds.includes(f.id) ? 'row-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedFileIds.includes(f.id)}
                        onChange={() => toggleSelect(f.id)}
                      />
                    </td>
                    <td>{f.id}</td>
                    <td>
                      <strong>{f.name}</strong>
                    </td>
                    <td>{(f.size_bytes / 1024).toFixed(1)} KB</td>
                    <td>{new Date(f.uploaded_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
