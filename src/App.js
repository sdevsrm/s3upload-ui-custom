import React from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import awsconfig from './aws-exports';

import { StorageBrowser } from './storage/StorageBrowserConfig';
import AnalyzeVideoView from './storage/AnalyzeVideoView';
import NetworkStatus from './components/NetworkStatus';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: awsconfig.aws_user_pools_id,
      userPoolClientId: awsconfig.aws_user_pools_web_client_id,
      identityPoolId: awsconfig.aws_cognito_identity_pool_id,
    }
  },
  Storage: {
    S3: {
      bucket: awsconfig.aws_user_files_s3_bucket,
      region: awsconfig.aws_user_files_s3_bucket_region,
    }
  }
});

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="app-container">
          <header className="app-header">
            <div className="app-title">
              <span className="app-logo">☁️</span>
              S3 Upload Tool v2
            </div>
            <div className="app-user">
              <span>{user?.username}</span>
              <button className="sign-out-btn" onClick={signOut}>Sign out</button>
            </div>
          </header>

          <NetworkStatus />

          <main className="app-main">
            <StorageBrowser views={{ AnalyzeVideoView }} />
          </main>
        </div>
      )}
    </Authenticator>
  );
}

export default App;
