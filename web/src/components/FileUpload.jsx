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
    <div className="card file-upload" id="files">
      <div className="section-title">
        <span className="section-kicker">LIBRARY</span>
        <h2>
          Files <span className="title-count">{files.length}</span>
        </h2>
      </div>

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
        <p>{uploading ? 'Uploading…' : 'Drop files here or browse'}</p>
        <span className="hint-text">Text files · up to 10 MB each</span>
      </div>

      {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div className="file-list-section">
        <div className="section-header">
          <h3>Uploaded files</h3>
          {files.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={selectAll}>
              {selectedFileIds.length === files.length ? 'Clear selection' : 'Select all'}
            </button>
          )}
        </div>

        {files.length === 0 ? (
          <p className="empty-text">No files uploaded yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th width="40">Select</th>
                  <th>File name</th>
                  <th>Size</th>
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
                    <td>
                      <strong>{f.name}</strong>
                    </td>
                    <td>{(f.size_bytes / 1024).toFixed(1)} KB</td>
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
