import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import awsconfig from './aws-exports';

// Configure Amplify FIRST
Amplify.configure(awsconfig);

// THEN dynamically import App (which imports StorageBrowser)
import('./App').then(({ default: App }) => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
