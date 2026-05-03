/**
 * Shared GCP credentials helper.
 * - On local: uses the service account key file.
 * - On Cloud Run: uses Application Default Credentials (ADC).
 */
const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');
const path = require('path');
const fs = require('fs');

const GCP_PROJECT_ID = 'senior-design-488908';
const KEY_FILENAME = 'senior-design-488908-1d5d3e1681ee.json';

// Try multiple possible locations for the key file
const possiblePaths = [
  path.resolve(__dirname, '..', '..', KEY_FILENAME),              // backend/
  path.resolve(__dirname, '..', '..', '..', KEY_FILENAME),        // web-app/
  path.resolve(__dirname, '..', '..', '..', '..', KEY_FILENAME),  // LectureAI/
  path.resolve('/app', KEY_FILENAME),                              // Docker /app/
];

const credentialPath = possiblePaths.find(p => fs.existsSync(p)) || null;

function getStorageClient() {
  if (credentialPath) {
    console.log('[GCP] Using key file:', credentialPath);
    return new Storage({ keyFilename: credentialPath });
  }
  // Cloud Run: use Application Default Credentials
  console.log('[GCP] Using Application Default Credentials (ADC)');
  return new Storage();
}

function getPubSubClient() {
  if (credentialPath) {
    return new PubSub({ projectId: GCP_PROJECT_ID, keyFilename: credentialPath });
  }
  return new PubSub({ projectId: GCP_PROJECT_ID });
}

module.exports = { getStorageClient, getPubSubClient, GCP_PROJECT_ID, credentialPath };
