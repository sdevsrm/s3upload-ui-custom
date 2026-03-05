import React, { useState, useEffect } from 'react';
import {
  Container, Header, SpaceBetween, Table, Box, Link, Button,
  BreadcrumbGroup, Modal, Spinner, StatusIndicator
} from '@cloudscape-design/components';
import { Storage } from 'aws-amplify';
import { formatBytes, formatDate } from '../utils/formatters';

/**
 * S3 file browser with folder navigation, download, delete.
 * Displays content organized by category prefixes.
 */
const FilesBrowser = ({ bucketName, onError }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [contents, setContents] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { listContents(''); }, []);

  const listContents = async (path) => {
    try {
      setContents(null);
      const result = await Storage.list(path || '', {
        level: 'protected',
        pageSize: 1000
      });

      if (!result?.results) { setContents([]); return; }

      const items = result.results;
      const processed = new Map();

      // Pass 1: folders
      items.forEach(item => {
        if (!item.key || item.key === path || item.key.includes('.keep')) return;
        const rel = path ? item.key.replace(`${path}/`, '') : item.key;
        const parts = rel.split('/');
        if ((item.key.endsWith('/') || item.size === 0) && parts[0] && !processed.has(parts[0])) {
          processed.set(parts[0], {
            key: path ? `${path}/${parts[0]}` : parts[0],
            displayName: parts[0],
            size: 0,
            isFolder: true,
            lastModified: item.lastModified
          });
        }
      });

      // Pass 2: files + implicit folders
      items.forEach(item => {
        if (!item.key || item.key === path || item.key.endsWith('/') || item.key.endsWith('/.keep')) return;
        const rel = path ? item.key.replace(`${path}/`, '') : item.key;
        const parts = rel.split('/');
        if (parts.length === 1) {
          processed.set(parts[0], {
            key: item.key,
            displayName: parts[0],
            size: item.size,
            isFolder: false,
            lastModified: item.lastModified
          });
        } else if (parts[0] && !processed.has(parts[0])) {
          processed.set(parts[0], {
            key: path ? `${path}/${parts[0]}` : parts[0],
            displayName: parts[0],
            size: 0,
            isFolder: true,
            lastModified: item.lastModified
          });
        }
      });

      const sorted = Array.from(processed.values())
        .filter(i => !i.displayName.includes('.keep'))
        .sort((a, b) => {
          if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
          return a.displayName.localeCompare(b.displayName);
        });

      setContents(sorted);
    } catch (error) {
      onError?.(`Error listing contents: ${error.message}`);
      setContents([]);
    }
  };

  const navigateTo = (path) => {
    setCurrentPath(path);
    listContents(path);
  };

  const handleDownload = async (key) => {
    try {
      const url = await Storage.get(key, { level: 'protected' });
      window.open(url, '_blank');
    } catch (error) {
      onError?.(`Error downloading: ${error.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.isFolder) {
        const folderContents = await Storage.list(deleteTarget.key + '/', {
          level: 'protected', pageSize: 1000
        });
        for (const item of folderContents.results) {
          await Storage.remove(item.key, { level: 'protected' });
        }
        await Storage.remove(deleteTarget.key + '/', { level: 'protected' });
      } else {
        await Storage.remove(deleteTarget.key, { level: 'protected' });
      }
      await new Promise(r => setTimeout(r, 1500));
      await listContents(currentPath);
    } catch (error) {
      onError?.(`Error deleting: ${error.message}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  const breadcrumbs = [
    {
      text: bucketName || 'Bucket',
      href: '#',
      onClick: (e) => { e.preventDefault(); navigateTo(''); }
    },
    ...(currentPath ? currentPath.split('/').map((part, idx, arr) => ({
      text: part,
      href: '#',
      onClick: (e) => {
        e.preventDefault();
        navigateTo(arr.slice(0, idx + 1).join('/'));
      }
    })) : [])
  ];

  return (
    <>
      <Container
        header={
          <Header
            variant="h2"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                {currentPath && (
                  <Button
                    iconName="arrow-up"
                    onClick={() => navigateTo(currentPath.split('/').slice(0, -1).join('/'))}
                  >Up</Button>
                )}
                <Button iconName="refresh" onClick={() => listContents(currentPath)}>
                  Refresh
                </Button>
              </SpaceBetween>
            }
          >
            <BreadcrumbGroup items={breadcrumbs} />
          </Header>
        }
      >
        {contents === null ? (
          <Box textAlign="center" padding="l">
            <Spinner size="large" />
            <Box variant="p">Loading...</Box>
          </Box>
        ) : (
          <Table
            items={contents}
            columnDefinitions={[
              {
                id: 'name',
                header: 'Name',
                cell: item => (
                  <Link onFollow={() => item.isFolder ? navigateTo(item.key) : handleDownload(item.key)}>
                    {item.isFolder ? '📁 ' : '📄 '}{item.displayName}
                  </Link>
                )
              },
              {
                id: 'lastModified',
                header: 'Uploaded',
                cell: item => formatDate(item.lastModified)
              },
              {
                id: 'size',
                header: 'Size',
                cell: item => item.isFolder ? '-' : formatBytes(item.size)
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: item => (
                  <SpaceBetween direction="horizontal" size="xs">
                    {!item.isFolder && (
                      <Button iconName="download" onClick={() => handleDownload(item.key)}>
                        Download
                      </Button>
                    )}
                    <Button variant="link" onClick={() => setDeleteTarget(item)}>
                      Delete
                    </Button>
                  </SpaceBetween>
                )
              }
            ]}
            empty={
              <Box textAlign="center" color="inherit">
                <b>Empty</b>
                <Box variant="p" color="inherit">No files in this location</Box>
              </Box>
            }
          />
        )}
      </Container>

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header="Delete Confirmation"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button variant="primary" onClick={handleDelete}>Delete</Button>
              </SpaceBetween>
            </Box>
          }
        >
          Are you sure you want to delete <strong>{deleteTarget.displayName}</strong>?
          {deleteTarget.isFolder && <p>This will delete all contents within this folder.</p>}
        </Modal>
      )}
    </>
  );
};

export default FilesBrowser;
