import React from 'react';
import { Amplify } from 'aws-amplify';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import awsconfig from './aws-exports';

// Amplify v6 accepts v5 aws-exports format directly
// Must configure BEFORE StorageBrowser loads
Amplify.configure(awsconfig, {
  ssr: false
});

// Lazy require to ensure Amplify is configured first
const { StorageBrowser } = require('./storage/StorageBrowserConfig');
const AnalyzeVideoView = require('./storage/AnalyzeVideoView').default;
const { Authenticator } = require('@aws-amplify/ui-react');
const NetworkStatus = require('./components/NetworkStatus').default;

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
