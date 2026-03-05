import {
  createAmplifyAuthAdapter,
  createStorageBrowser,
  defaultActionConfigs,
  defaultHandlers,
} from '@aws-amplify/ui-react-storage/browser';
import '@aws-amplify/ui-react-storage/styles.css';
import { classifyFile, buildS3KeyFromName } from '../utils/fileClassifier';

/**
 * Custom upload handler that intercepts the default upload action
 * and rewrites the S3 key based on content type.
 *
 * images/2026/03/05/photo.jpg
 * videos/2026/03/05/bodycam.mp4
 * documents/2026/03/05/report.pdf
 */
const contentRoutedUpload = {
  ...defaultActionConfigs.upload,
  handler: (input) => {
    const { data, ...rest } = input;

    // Rewrite the key to include content-type prefix + date path
    const originalKey = data.key;
    const fileName = originalKey.split('/').pop() || originalKey;
    const fileType = data.type || '';
    const routedKey = buildS3KeyFromName(fileName, fileType);

    const modifiedInput = {
      ...rest,
      data: {
        ...data,
        key: routedKey,
      },
    };

    return defaultHandlers.upload(modifiedInput);
  },
};

/**
 * Custom action: Analyze Video
 * Appears in the actions menu when a video file is selected.
 * Polls the analysis DynamoDB/S3 results from the CF pipeline.
 */
const analyzeVideoAction = {
  actionListItem: {
    icon: 'search',
    label: 'Analyze Video',
    disable: (selected) => {
      if (!selected?.length || selected.length !== 1) return true;
      const item = selected[0];
      const key = (item.key || '').toLowerCase();
      const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.webm', '.m4v', '.mpg', '.mpeg'];
      return !videoExts.some(ext => key.endsWith(ext));
    },
  },
  handler: ({ data, config }) => {
    const handleAnalysis = async () => {
      try {
        // The video pipeline writes results to analysis/{uploadId}/results.json
        const uploadId = data.key.replace(/\//g, '_');
        const resultsKey = `analysis/${uploadId}/results.json`;

        // Fetch the results from S3
        const { getUrl } = await import('aws-amplify/storage');
        const { url } = await getUrl({ path: resultsKey });
        const response = await fetch(url.toString());

        if (!response.ok) {
          return {
            status: 'FAILED',
            message: 'Analysis not ready yet. The video pipeline may still be processing.',
            error: new Error('Analysis results not found'),
          };
        }

        const results = await response.json();
        // Open results in a new tab as formatted JSON
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        window.open(URL.createObjectURL(blob), '_blank');

        return {
          status: 'COMPLETE',
          value: { key: resultsKey },
        };
      } catch (error) {
        return {
          status: 'FAILED',
          message: `Analysis lookup failed: ${error.message}`,
          error,
        };
      }
    };

    return { result: handleAnalysis() };
  },
  viewName: 'AnalyzeVideoView',
};

export const { StorageBrowser, useView, useAction } = createStorageBrowser({
  config: createAmplifyAuthAdapter(),
  actions: {
    default: {
      upload: contentRoutedUpload,
    },
    custom: {
      analyzeVideo: analyzeVideoAction,
    },
  },
});
