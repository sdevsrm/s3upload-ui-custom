import React from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './App.css';

import { StorageBrowser } from './storage/StorageBrowserConfig';
import AnalyzeVideoView from './storage/AnalyzeVideoView';
import NetworkStatus from './components/NetworkStatus';

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
