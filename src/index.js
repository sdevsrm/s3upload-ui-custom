import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import awsconfig from './aws-exports';

// Configure BEFORE rendering App (which imports StorageBrowser)
Amplify.configure(awsconfig);

// Dynamic import ensures Amplify is configured before StorageBrowser loads
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
