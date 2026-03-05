import React from 'react';
import { Button, Flex, Text, Loader, Message } from '@aws-amplify/ui-react';
import { useView, useAction } from './StorageBrowserConfig';

/**
 * Custom view for the "Analyze Video" action.
 * Shows analysis status and results from the video pipeline.
 */
export default function AnalyzeVideoView() {
  const { onActionExit, fileDataItems } = useView('LocationDetail');

  const items = React.useMemo(
    () => fileDataItems || [],
    [fileDataItems]
  );

  const [{ tasks }, handleAnalyze] = useAction('analyzeVideo', { items });

  return (
    <Flex direction="column" padding="medium" gap="medium">
      <Button variation="link" onClick={() => onActionExit()}>
        ← Back
      </Button>

      <Text fontSize="large" fontWeight="bold">
        🎬 Video Analysis
      </Text>

      <Text color="font.tertiary">
        Checks if the video pipeline has completed analysis.
        Results include audio detection, scene descriptions, and activity classification.
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
            <Message colorTheme="success">
              Analysis found! Results opened in a new tab.
            </Message>
          )}
          {task.status === 'FAILED' && (
            <Message colorTheme="warning">
              {task.message || 'Analysis not ready yet. The video may still be processing.'}
            </Message>
          )}
        </Flex>
      ))}
    </Flex>
  );
}
