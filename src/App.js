import React from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import awsconfig from './aws-exports';
import NetworkStatus from './components/NetworkStatus';

// Configure Amplify immediately at module load
Amplify.configure(awsconfig);

// Lazy-load StorageBrowser — React.lazy defers the import() to render time,
// guaranteeing Amplify.configure() has already executed
const StorageBrowserWrapper = React.lazy(() =>
  import('./storage/StorageBrowserSetup')
);

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
            <React.Suspense fallback={
              <div style={{ padding: '40px', textAlign: 'center' }}>
                Loading Storage Browser...
              </div>
            }>
              <StorageBrowserWrapper />
            </React.Suspense>
          </main>
        </div>
      )}
    </Authenticator>
  );
}

export default App;
