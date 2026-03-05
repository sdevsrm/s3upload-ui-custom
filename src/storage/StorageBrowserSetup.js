import React from 'react';
import {
  createAmplifyAuthAdapter,
  createStorageBrowser,
  defaultActionConfigs,
  defaultHandlers,
} from '@aws-amplify/ui-react-storage/browser';
import '@aws-amplify/ui-react-storage/styles.css';
import { buildS3KeyFromName } from '../utils/fileClassifier';
import { Button, Flex, Text, Loader, Message } from '@aws-amplify/ui-react';

// --- Custom upload: content-type routing ---
const contentRoutedUpload = {
  ...defaultActionConfigs.upload,
  handler: (input) => {
    const { data, ...rest } = input;
    const fileName = (data.key || '').split('/').pop() || data.key;
    const routedKey = buildS3KeyFromName(fileName, data.type || '');
    return defaultHandlers.upload({
      ...rest,
      data: { ...data, key: routedKey },
    });
  },
};

// --- Custom action: Analyze Video ---
const analyzeVideoAction = {
  actionListItem: {
    icon: 'search',
    label: 'Analyze Video',
    disable: (selected) => {
      if (!selected?.length || selected.length !== 1) return true;
      const key = (selected[0].key || '').toLowerCase();
      return !['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.webm'].some(ext => key.endsWith(ext));
    },
  },
  handler: ({ data }) => {
    const handleAnalysis = async () => {
      try {
        const uploadId = data.key.replace(/\//g, '_');
        const resultsKey = `analysis/${uploadId}/results.json`;
        const { getUrl } = await import('aws-amplify/storage');
        const { url } = await getUrl({ path: resultsKey });
        const response = await fetch(url.toString());
        if (!response.ok) {
          return { status: 'FAILED', message: 'Analysis not ready yet.' };
        }
        const results = await response.json();
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        window.open(URL.createObjectURL(blob), '_blank');
        return { status: 'COMPLETE', value: { key: resultsKey } };
      } catch (error) {
        return { status: 'FAILED', message: error.message, error };
      }
    };
    return { result: handleAnalysis() };
  },
  viewName: 'AnalyzeVideoView',
};

// --- Create StorageBrowser (Amplify must be configured before this runs) ---
const { StorageBrowser, useView, useAction } = createStorageBrowser({
  config: createAmplifyAuthAdapter(),
  actions: {
    default: { upload: contentRoutedUpload },
    custom: { analyzeVideo: analyzeVideoAction },
  },
});

// --- Analyze Video View ---
function AnalyzeVideoView() {
  const { onActionExit, fileDataItems } = useView('LocationDetail');
  const items = React.useMemo(() => fileDataItems || [], [fileDataItems]);
  const [{ tasks }, handleAnalyze] = useAction('analyzeVideo', { items });

  return (
    <Flex direction="column" padding="medium" gap="medium">
      <Button variation="link" onClick={() => onActionExit()}>← Back</Button>
      <Text fontSize="large" fontWeight="bold">🎬 Video Analysis</Text>
      <Text color="font.tertiary">
        Checks if the video pipeline has completed analysis.
      </Text>
      {items.map((item) => (
        <Flex key={item.key} direction="row" alignItems="center" gap="small">
          <Text>📹 {item.key.split('/').pop()}</Text>
        </Flex>
      ))}
      <Button variation="primary" onClick={() => handleAnalyze()}>
        Check Analysis Results
      </Button>
      {tasks?.map((task) => (
        <Flex key={task.data.key} direction="column" gap="small">
          {task.status === 'PENDING' && <Loader />}
          {task.status === 'COMPLETE' && (
            <Message colorTheme="success">Analysis found! Results opened in a new tab.</Message>
          )}
          {task.status === 'FAILED' && (
            <Message colorTheme="warning">{task.message || 'Analysis not ready yet.'}</Message>
          )}
        </Flex>
      ))}
    </Flex>
  );
}

// --- Default export: the rendered StorageBrowser with custom views ---
export default function StorageBrowserSetup() {
  return <StorageBrowser views={{ AnalyzeVideoView }} />;
}
