import React from 'react';
import {
  Container, Header, ProgressBar, SpaceBetween, Box,
  ColumnLayout, Alert, Button, StatusIndicator
} from '@cloudscape-design/components';

/**
 * Displays upload progress for all active/completed uploads.
 * Shows per-file progress, speed, ETA, pause/resume controls.
 */
const UploadProgress = ({ uploads, onPause, onResume, onAbort }) => {
  if (!uploads || uploads.length === 0) return null;

  const statusMap = {
    'in-progress': 'in-progress',
    'completed': 'success',
    'error': 'error',
    'paused': 'stopped'
  };

  return (
    <Container header={<Header variant="h2">Upload Progress</Header>}>
      <SpaceBetween size="m">
        {uploads.map((item) => (
          <Container
            key={item.id}
            header={
              <Header
                variant="h3"
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    {item.status === 'in-progress' && (
                      <Button onClick={() => onPause?.(item.id)} iconName="pause">
                        Pause
                      </Button>
                    )}
                    {item.status === 'paused' && (
                      <Button onClick={() => onResume?.(item.id)} variant="primary">
                        Resume
                      </Button>
                    )}
                    {(item.status === 'in-progress' || item.status === 'paused') && (
                      <Button onClick={() => onAbort?.(item.id)} variant="link">
                        Cancel
                      </Button>
                    )}
                  </SpaceBetween>
                }
              >
                <SpaceBetween direction="horizontal" size="xs">
                  <CategoryBadge category={item.category} />
                  {item.filename}
                </SpaceBetween>
              </Header>
            }
          >
            <SpaceBetween size="s">
              {item.status === 'in-progress' && (
                <Alert type="warning" statusIconAriaLabel="Warning">
                  <span style={{ color: '#d13212' }}>
                    Do not close this tab until upload completes. You can pause and resume later.
                  </span>
                </Alert>
              )}

              {item.status === 'paused' && (
                <Alert type="info">
                  Upload paused. {item.completedParts}/{item.totalParts} parts completed.
                  Click Resume to continue.
                </Alert>
              )}

              <ProgressBar
                status={statusMap[item.status] || item.status}
                value={item.percentage || 0}
                variant="standalone"
                label="Upload Progress"
                additionalInfo={`${(item.percentage || 0).toFixed(1)}%`}
              />

              <ColumnLayout columns={2} variant="text-grid">
                <div>
                  <Box variant="awsui-key-label">File Size</Box>
                  <div>{item.filesize}</div>
                </div>
                <div>
                  <Box variant="awsui-key-label">Upload Speed</Box>
                  <div>{item.uploadSpeed || 'Calculating...'}</div>
                </div>
                <div>
                  <Box variant="awsui-key-label">Time Remaining</Box>
                  <div>{item.estimatedTimeRemaining || 'Calculating...'}</div>
                </div>
                <div>
                  <Box variant="awsui-key-label">Elapsed Time</Box>
                  <div>{item.elapsedTime || '0s'}</div>
                </div>
                <div>
                  <Box variant="awsui-key-label">Category</Box>
                  <div>{item.category || 'unknown'}</div>
                </div>
                <div>
                  <Box variant="awsui-key-label">S3 Path</Box>
                  <div style={{ fontSize: '12px', wordBreak: 'break-all' }}>{item.s3Key}</div>
                </div>
                {item.originalDate && (
                  <div>
                    <Box variant="awsui-key-label">Original File Date</Box>
                    <div>{new Date(item.originalDate).toLocaleString()}</div>
                  </div>
                )}
                {item.totalParts > 1 && (
                  <div>
                    <Box variant="awsui-key-label">Parts</Box>
                    <div>{item.completedParts}/{item.totalParts}</div>
                  </div>
                )}
              </ColumnLayout>

              {item.error && (
                <Alert type="error" header="Upload Error">{item.error}</Alert>
              )}
            </SpaceBetween>
          </Container>
        ))}
      </SpaceBetween>
    </Container>
  );
};

const CategoryBadge = ({ category }) => {
  const colors = {
    image: '#2ea597',
    video: '#9469d6',
    audio: '#eb5f07',
    document: '#0972d3',
    archive: '#8d6e63',
    other: '#687078'
  };
  return (
    <span style={{
      background: colors[category] || colors.other,
      color: '#fff',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase'
    }}>
      {category || 'other'}
    </span>
  );
};

export default UploadProgress;
