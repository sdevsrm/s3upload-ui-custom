import React, { useRef } from 'react';
import {
  Container, Header, SpaceBetween, Button, TokenGroup, Alert, Box
} from '@cloudscape-design/components';
import { UPLOAD_CONFIG } from '../config/upload';
import { classifyFile } from '../utils/fileClassifier';
import { formatBytes } from '../utils/formatters';

/**
 * File selection panel with drag-and-drop, file/folder pickers,
 * and content-type preview before upload.
 */
const UploadPanel = ({ uploadList, onUploadListChange, onFilesChange, onUpload, isUploading, disabled }) => {
  const fileInput = useRef(null);
  const folderInput = useRef(null);

  const handleFileSelect = (e, isFolder = false) => {
    e.preventDefault();
    const files = Array.from(e.target.files);
    const items = [];
    const validFiles = [];

    for (const file of files) {
      if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
        continue; // skip oversized
      }
      const category = classifyFile(file);
      const path = isFolder ? file.webkitRelativePath : file.name;
      items.push({
        label: path,
        labelTag: formatBytes(file.size),
        description: `${category.toUpperCase()} • ${file.type || 'unknown type'}`,
        id: `sel-${Date.now()}-${items.length}`,
        path,
        category
      });
      validFiles.push(file);
    }

    onUploadListChange(items);
    onFilesChange(validFiles);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleDismiss = ({ detail: { itemIndex } }) => {
    onUploadListChange(prev => [
      ...prev.slice(0, itemIndex),
      ...prev.slice(itemIndex + 1)
    ]);
    onFilesChange(prev => [
      ...prev.slice(0, itemIndex),
      ...prev.slice(itemIndex + 1)
    ]);
  };

  // Count by category for summary
  const categoryCounts = {};
  for (const item of uploadList) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  }

  return (
    <SpaceBetween size="s">
      <SpaceBetween direction="horizontal" size="xs">
        <Button
          onClick={() => fileInput.current.click()}
          iconName="upload"
          disabled={isUploading || disabled}
        >
          Add Files
        </Button>
        <Button
          onClick={() => folderInput.current.click()}
          iconName="folder"
          disabled={isUploading || disabled}
        >
          Add Folder
        </Button>
      </SpaceBetween>

      <input
        type="file"
        ref={fileInput}
        onChange={(e) => handleFileSelect(e, false)}
        style={{ display: 'none' }}
        multiple
      />
      <input
        type="file"
        ref={folderInput}
        onChange={(e) => handleFileSelect(e, true)}
        style={{ display: 'none' }}
        webkitdirectory=""
        directory=""
        multiple
      />

      {uploadList.length > 0 && (
        <SpaceBetween size="s">
          {/* Category summary */}
          <Box variant="small" color="text-body-secondary">
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <span key={cat} style={{ marginRight: '12px' }}>
                {cat}: {count}
              </span>
            ))}
            {' • '}{uploadList.length} file{uploadList.length !== 1 ? 's' : ''} selected
          </Box>

          <TokenGroup
            onDismiss={handleDismiss}
            items={uploadList}
            alignment="vertical"
            limit={10}
          />

          <Button
            variant="primary"
            onClick={onUpload}
            disabled={isUploading}
            loading={isUploading}
          >
            {isUploading ? 'Uploading...' : `Upload ${uploadList.length} file${uploadList.length !== 1 ? 's' : ''}`}
          </Button>
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
};

export default UploadPanel;
