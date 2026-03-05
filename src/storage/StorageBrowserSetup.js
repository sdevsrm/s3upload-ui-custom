import React from 'react';
import {
  createAmplifyAuthAdapter,
  createStorageBrowser,
  defaultActionConfigs,
  defaultHandlers,
} from '@aws-amplify/ui-react-storage/browser';
import '@aws-amplify/ui-react-storage/styles.css';
import { buildS3KeyFromName, extractFileMetadata } from '../utils/fileClassifier';
import { Button, Flex, Text, Loader, Message } from '@aws-amplify/ui-react';

// --- Custom upload: content-type routing ---
const contentRoutedUpload = {
  ...defaultActionConfigs.upload,
  handler: (input) => {
    const { data, ...rest } = input;
    const fileName = (data.key || '').split('/').pop() || data.key;
    const routedKey = buildS3KeyFromName(fileName, data.type || '');
    const metadata = data.file ? extractFileMetadata(data.file) : {};
    return defaultHandlers.upload({
      ...rest,
      data: { ...data, key: routedKey, metadata },
    });
  },
};

// --- Custom action: View Analysis (image / audio / document) ---
const ANALYZED_PREFIXES = ['images/', 'audio/', 'documents/'];

const viewAnalysisAction = {
  actionListItem: {
    icon: 'search',
    label: 'View Analysis',
    disable: (selected) => {
      if (!selected?.length || selected.length !== 1) return true;
      const key = selected[0].key || '';
      // key may be full path OR relative (when browsed into subfolder)
      return !ANALYZED_PREFIXES.some(p => key.startsWith(p) || key.includes(`/${p.replace('/', '')}/`) || selected[0].type === 'FILE');
    },
  },
  handler: ({ data }) => {
    const fetch_ = async () => {
      try {
        const uploadId = data.key.replace(/\//g, '_');
        const { getUrl } = await import('aws-amplify/storage');
        const { url } = await getUrl({ path: `analysis/${uploadId}/results.json` });
        const res = await fetch(url.toString());
        if (!res.ok) return { status: 'FAILED', message: 'Analysis not ready yet.' };
        const results = await res.json();
        return { status: 'COMPLETE', value: results };
      } catch (e) {
        return { status: 'FAILED', message: e.message, error: e };
      }
    };
    return { result: fetch_() };
  },
  viewName: 'ViewAnalysisView',
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
    const fetch_ = async () => {
      try {
        const uploadId = data.key.replace(/\//g, '_');
        const { getUrl } = await import('aws-amplify/storage');
        const { url } = await getUrl({ path: `analysis/${uploadId}/results.json` });
        const res = await fetch(url.toString());
        if (!res.ok) return { status: 'FAILED', message: 'Analysis not ready yet.' };
        return { status: 'COMPLETE', value: await res.json() };
      } catch (e) {
        return { status: 'FAILED', message: e.message, error: e };
      }
    };
    return { result: fetch_() };
  },
  viewName: 'AnalyzeVideoView',
};

// --- Create StorageBrowser (Amplify must be configured before this runs) ---
const { StorageBrowser, useView, useAction } = createStorageBrowser({
  config: createAmplifyAuthAdapter(),
  actions: {
    default: { upload: contentRoutedUpload },
    custom: {
      analyzeVideo: analyzeVideoAction,
      viewAnalysis: viewAnalysisAction,
    },
  },
});

// --- View Analysis View (image / audio / document) ---
function ViewAnalysisView() {
  const { onActionExit, fileDataItems } = useView('LocationDetail');
  const items = React.useMemo(() => fileDataItems || [], [fileDataItems]);
  const [{ tasks }, handleView] = useAction('viewAnalysis', { items });
  const task = tasks?.[0];
  const results = task?.status === 'COMPLETE' ? task.value : null;

  const renderAnalysis = (a) => {
    if (!a) return null;
    if (a.type === 'image') return (
      <Flex direction="column" gap="small">
        <Text fontWeight="bold">Description</Text>
        <Text>{a.analysis?.description}</Text>
        {a.analysis?.tags?.length > 0 && <Text color="font.tertiary">Tags: {a.analysis.tags.join(', ')}</Text>}
      </Flex>
    );
    if (a.type === 'audio') return (
      <Flex direction="column" gap="small">
        <Text fontWeight="bold">Transcript</Text>
        <Text>{a.analysis?.transcript || '(empty)'}</Text>
        <Text color="font.tertiary">Language: {a.analysis?.language} · Words: {a.analysis?.wordCount}</Text>
      </Flex>
    );
    if (a.type === 'document') return (
      <Flex direction="column" gap="small">
        <Text fontWeight="bold">Summary</Text>
        <Text>{a.analysis?.summary}</Text>
        {a.analysis?.keyTopics?.length > 0 && <Text color="font.tertiary">Topics: {a.analysis.keyTopics.join(', ')}</Text>}
        {a.analysis?.actionItems?.length > 0 && (
          <Flex direction="column" gap="xxs">
            <Text fontWeight="bold">Action Items</Text>
            {a.analysis.actionItems.map((item, i) => <Text key={i}>• {item}</Text>)}
          </Flex>
        )}
      </Flex>
    );
    return <Text>{JSON.stringify(a.analysis, null, 2)}</Text>;
  };

  return (
    <Flex direction="column" padding="medium" gap="medium">
      <Button variation="link" onClick={() => onActionExit()}>← Back</Button>
      <Text fontSize="large" fontWeight="bold">📊 Analysis Results</Text>
      {items.map((item) => (
        <Text key={item.key} color="font.tertiary">{item.key.split('/').pop()}</Text>
      ))}
      <Button variation="primary" onClick={() => handleView()}>Load Results</Button>
      {task?.status === 'PENDING' && <Loader />}
      {task?.status === 'FAILED' && <Message colorTheme="warning">{task.message}</Message>}
      {results && (
        <Flex direction="column" gap="small" padding="small"
          style={{ background: 'var(--amplify-colors-background-secondary)', borderRadius: 8 }}>
          <Text color="font.tertiary" fontSize="small">
            Status: {results.status} · Completed: {results.completedAt ? new Date(results.completedAt * 1000).toLocaleString() : '—'}
          </Text>
          {renderAnalysis(results)}
        </Flex>
      )}
    </Flex>
  );
}

// --- Analyze Video View ---
const CLASSIFICATION_EMOJI = {
  approach: '🚶', interaction: '🤝', conversation: '💬',
  processing: '⚙️', departure: '🚪', idle: '💤', other: '📌'
};

function AnalyzeVideoView() {
  const { onActionExit, fileDataItems } = useView('LocationDetail');
  const items = React.useMemo(() => fileDataItems || [], [fileDataItems]);
  const [{ tasks }, handleAnalyze] = useAction('analyzeVideo', { items });
  const [progress, setProgress] = React.useState(null);
  const pollRef = React.useRef(null);

  const startPolling = React.useCallback(async (uploadId) => {
    const { getUrl } = await import('aws-amplify/storage');
    pollRef.current = setInterval(async () => {
      try {
        const { url } = await getUrl({ path: `analysis/${uploadId}/progress.json` });
        const res = await fetch(url.toString());
        if (res.ok) setProgress(await res.json());
      } catch (_) {}
    }, 8000);
  }, []);

  React.useEffect(() => () => clearInterval(pollRef.current), []);

  const handleClick = () => {
    if (items[0]) startPolling(items[0].key.replace(/\//g, '_'));
    handleAnalyze();
  };

  const task = tasks?.[0];
  const results = task?.status === 'COMPLETE' ? task.value : null;

  React.useEffect(() => {
    if (task?.status === 'COMPLETE' || task?.status === 'FAILED') {
      clearInterval(pollRef.current);
      setProgress(null);
    }
  }, [task?.status]);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <Flex direction="column" padding="medium" gap="medium">
      <Button variation="link" onClick={() => onActionExit()}>← Back</Button>
      <Text fontSize="large" fontWeight="bold">🎬 Video Analysis</Text>
      {items.map(item => (
        <Text key={item.key} color="font.tertiary">{item.key.split('/').pop()}</Text>
      ))}

      <Button variation="primary" onClick={handleClick}>Check Analysis Results</Button>

      {task?.status === 'PENDING' && (
        <Flex direction="column" gap="small">
          <Loader />
          <Text>{progress
            ? `Analyzing… ${progress.segmentsComplete} of ${progress.segmentsTotal} segments complete (~${Math.round((progress.segmentsTotal - progress.segmentsComplete) * 15 / 60)} min remaining)`
            : 'Checking pipeline status…'}
          </Text>
        </Flex>
      )}

      {task?.status === 'FAILED' && (
        <Message colorTheme="warning">{task.message || 'Analysis not ready yet.'}</Message>
      )}

      {results && (
        <Flex direction="column" gap="medium">
          <Flex direction="row" gap="large" padding="small"
            style={{ background: 'var(--amplify-colors-background-secondary)', borderRadius: 8 }}>
            <Flex direction="column" alignItems="center">
              <Text fontWeight="bold">{results.summary?.totalDuration}</Text>
              <Text fontSize="small" color="font.tertiary">Duration</Text>
            </Flex>
            <Flex direction="column" alignItems="center">
              <Text fontWeight="bold">{results.summary?.actionablePercent}</Text>
              <Text fontSize="small" color="font.tertiary">Actionable</Text>
            </Flex>
            <Flex direction="column" alignItems="center">
              <Text fontWeight="bold">{results.summary?.totalSegments}</Text>
              <Text fontSize="small" color="font.tertiary">Segments</Text>
            </Flex>
            <Flex direction="column" alignItems="center">
              <Text fontWeight="bold">{results.summary?.silentDuration}</Text>
              <Text fontSize="small" color="font.tertiary">Silent</Text>
            </Flex>
          </Flex>

          <Text fontWeight="bold">Actionable Segments</Text>
          {results.segments?.filter(s => s.actionable).map((seg, i) => (
            <Flex key={i} direction="column" gap="xxs" padding="small"
              style={{ background: 'var(--amplify-colors-background-secondary)', borderRadius: 6 }}>
              <Flex direction="row" gap="small" alignItems="center">
                <Text fontWeight="bold">{CLASSIFICATION_EMOJI[seg.classification] || '📌'} {fmt(seg.start)} – {fmt(seg.end)}</Text>
                <Text fontSize="small" color="font.tertiary">{seg.classification} · {seg.duration?.toFixed(1)}s</Text>
              </Flex>
              <Text fontSize="small">{seg.description}</Text>
            </Flex>
          ))}
        </Flex>
      )}
    </Flex>
  );
}

export default function StorageBrowserSetup() {
  return (
    <StorageBrowser
      views={{ AnalyzeVideoView, ViewAnalysisView }}
      defaultValue={{
        location: {
          bucket: 's3uploadv281d32340117947dd82b04e7880362a5156621-dev',
          prefix: '',
          permissions: ['delete', 'get', 'list', 'write'],
        },
      }}
    />
  );
}
