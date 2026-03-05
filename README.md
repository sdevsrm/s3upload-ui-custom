# S3 Upload Tool v2

A web application for uploading files to Amazon S3 with automatic content-type routing, original metadata preservation, and AI-powered video analysis using Amazon Nova.

Built on [Amplify StorageBrowser](https://ui.docs.amplify.aws/react/connected-components/storage/storage-browser) — gives you a full-featured S3 file manager (browse, upload, download, delete, copy, search, file preview) out of the box, with custom extensions for content routing and video intelligence.

> **This is your own app on your own CloudFront URL** — not the AWS Console.

---

## What's New (vs v1)

| Feature | v1 (2000+ lines custom) | v2 (StorageBrowser + extensions) |
|---------|------------------------|----------------------------------|
| File browsing | Hand-built Cloudscape Table | Built-in: paginated, searchable, file preview |
| Upload | `Storage.put()` with progress | Built-in: drag-and-drop, progress, overwrite toggle |
| Download | Presigned URL | Built-in: single + bulk download |
| Delete | Custom modal | Built-in: files + folders with confirmation |
| Copy files | ❌ | ✅ Built-in |
| Create folder | Custom `prompt()` | ✅ Built-in |
| File preview | ❌ | ✅ Images, video, text in-browser |
| Search | ❌ | ✅ With subfolder toggle |
| Drag & drop | ❌ | ✅ Built-in DropZone |
| Content-type routing | ❌ | ✅ Auto-sorts into `images/`, `videos/`, `documents/` |
| Metadata preservation | ❌ | ✅ Original file dates stored as S3 metadata |
| Video intelligence | ❌ | ✅ FFmpeg + Amazon Nova scene analysis |
| Network resilience | ❌ | ✅ Offline detection banner |
| Code size | ~2000 lines (1 file) | ~330 lines (8 files) |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Your CloudFront URL → React App                                 │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  App.js                                                    │  │
│  │  ├── Header bar (app title, username, sign out)            │  │
│  │  ├── NetworkStatus (offline banner)                        │  │
│  │  └── <StorageBrowser />  ← Amplify component               │  │
│  │       │                                                    │  │
│  │       ├── LocationsView    (bucket/prefix selection)       │  │
│  │       ├── LocationDetailView (file table, search, preview) │  │
│  │       ├── UploadView       (drag-drop, progress, overwrite)│  │
│  │       ├── DownloadView     (bulk download)                 │  │
│  │       ├── DeleteView       (with folder support)           │  │
│  │       ├── CopyView         (copy between locations)        │  │
│  │       ├── CreateFolderView (folder creation)               │  │
│  │       │                                                    │  │
│  │       ├── CUSTOM: Upload override                          │  │
│  │       │   photo.jpg → images/2026/03/05/photo.jpg          │  │
│  │       │   bodycam.mp4 → videos/2026/03/05/bodycam.mp4      │  │
│  │       │   report.pdf → documents/2026/03/05/report.pdf     │  │
│  │       │                                                    │  │
│  │       └── CUSTOM: "Analyze Video" action                   │  │
│  │           (polls pipeline results from S3)                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Auth: Amazon Cognito (Authenticator wrapper)                    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Amazon S3 Bucket                                                │
│                                                                  │
│  {access-level}/{identityId}/                                    │
│  ├── images/2026/03/05/photo.jpg                                 │
│  ├── videos/2026/03/05/bodycam.mp4     ← triggers pipeline      │
│  ├── audio/2026/03/05/recording.mp3                              │
│  ├── documents/2026/03/05/report.pdf                             │
│  ├── archives/2026/03/05/backup.zip                              │
│  ├── other/2026/03/05/data.bin                                   │
│  └── analysis/{upload-id}/results.json ← pipeline output        │
│                                                                  │
│  Per-file S3 metadata:                                           │
│  ├── x-amz-meta-upload-date: 2026-03-05T17:28:00Z               │
│  ├── x-amz-meta-file-last-modified: 2026-03-02T14:30:00Z        │
│  ├── x-amz-meta-content-category: image                         │
│  ├── x-amz-meta-original-name: IMG_4521.jpg                     │
│  └── x-amz-meta-mime-type: image/jpeg                            │
└──────────────────────────┬───────────────────────────────────────┘
                           │ S3 Event (videos/ prefix)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Video Analysis Pipeline (CloudFormation — optional)             │
│                                                                  │
│  S3 Event → Trigger Lambda → Step Functions:                     │
│    Step 1: AudioAnalyzer Lambda                                  │
│            FFmpeg silencedetect → segments with has_audio flag    │
│    Step 2: NovaAnalyzer Lambda                                   │
│            Bedrock Nova Pro → scene descriptions per segment     │
│    Step 3: ResultsAggregator Lambda                              │
│            → DynamoDB (summary) + S3 JSON (full results)         │
│                                                                  │
│  Example output for a body cam video:                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 0:00-2:28  | No audio | "Officer walking to vehicle"      │  │
│  │ 2:28-8:15  | Audio ✓  | "Officer speaking with driver"    │  │
│  │ 8:15-12:45 | No audio | "Officer returning to patrol car" │  │
│  │                                                            │  │
│  │ Summary: 5m47s actionable out of 12m45s (45%)              │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
s3upload-v2/
├── package.json                          Dependencies (Amplify v6, React 18)
├── public/
│   └── index.html                        HTML shell
├── src/
│   ├── App.js                            Main app: header + auth + StorageBrowser
│   ├── App.css                           Styling (header, layout)
│   ├── index.js                          React entry point
│   ├── aws-exports.js                  Generated by Amplify (after amplify init)
│   │
│   ├── config/
│   │   └── upload.js                     Content category definitions
│   │                                     (image, video, audio, document, archive, other)
│   │                                     Each has: S3 prefix, MIME patterns, file extensions
│   │
│   ├── utils/
│   │   ├── fileClassifier.js             MIME detection → category classification
│   │   │                                 buildS3KeyFromName() → routed S3 key
│   │   │                                 extractFileMetadata() → S3 custom metadata
│   │   └── formatters.js                 formatBytes, formatTime, formatSpeed, formatDate
│   │
│   ├── storage/
│   │   ├── StorageBrowserConfig.js       ★ Core: creates StorageBrowser with:
│   │   │                                   - Upload override (content-type routing)
│   │   │                                   - "Analyze Video" custom action
│   │   └── AnalyzeVideoView.js           Custom UI for video analysis results
│   │
│   ├── components/
│   │   ├── NetworkStatus.js              Offline/online detection banner
│   │   ├── UploadProgress.js             [CLOUDSCAPE FALLBACK] Progress bars
│   │   ├── FilesBrowser.cloudscape.js.bak    [BACKUP] Cloudscape file browser
│   │   └── UploadPanel.cloudscape.js.bak     [BACKUP] Cloudscape upload panel
│   │
│   └── services/
│       ├── uploadStateManager.js         [FUTURE] localStorage persistence for pause/resume
│       └── resumableUpload.js            [FUTURE] Chunked upload with pause/resume/retry
│
└── video-pipeline.yaml                   CloudFormation template for backend:
                                          - 3 Lambda functions
                                          - 1 Step Functions state machine
                                          - 1 DynamoDB table
                                          - IAM roles
```

### File Status Legend

| Status | Meaning |
|--------|---------|
| ★ Active | Used by the current StorageBrowser-based app |
| [CLOUDSCAPE FALLBACK] | Preserved — swap to these if you prefer Cloudscape UI |
| [FUTURE] | Built and ready — will integrate when StorageBrowser supports pause/resume hooks |
| [BACKUP] | Renamed `.bak` — original custom components for reference |

---

## Content-Type Routing

When a user uploads a file, the upload handler intercepts it, detects the MIME type, and rewrites the S3 key:

```
User uploads "IMG_4521.jpg" (image/jpeg)
  → S3 key: images/2026/03/05/IMG_4521.jpg

User uploads "bodycam-032.mp4" (video/mp4)
  → S3 key: videos/2026/03/05/bodycam-032.mp4

User uploads "quarterly-report.pdf" (application/pdf)
  → S3 key: documents/2026/03/05/quarterly-report.pdf

User uploads "backup.tar.gz" (application/gzip)
  → S3 key: archives/2026/03/05/backup.tar.gz

User uploads "data.bin" (unknown)
  → S3 key: other/2026/03/05/data.bin
```

| Category | MIME Patterns | S3 Prefix | Example Extensions |
|----------|--------------|-----------|-------------------|
| Image | `image/*` | `images/` | .jpg .png .gif .heic .raw |
| Video | `video/*` | `videos/` | .mp4 .mov .avi .mkv .webm |
| Audio | `audio/*` | `audio/` | .mp3 .wav .aac .flac .ogg |
| Document | `application/pdf`, `text/*`, Office | `documents/` | .pdf .docx .xlsx .csv .txt |
| Archive | `application/zip`, tar, gz, rar | `archives/` | .zip .tar .gz .rar .7z |
| Other | Everything else | `other/` | .bin .dat etc. |

---

## Metadata Preservation

Every uploaded file gets S3 custom metadata headers:

| Metadata Key | Value | Purpose |
|-------------|-------|---------|
| `x-amz-meta-upload-date` | `2026-03-05T17:28:00Z` | When it was uploaded |
| `x-amz-meta-file-last-modified` | `2026-03-02T14:30:00Z` | Original file date from device |
| `x-amz-meta-original-name` | `IMG_4521.jpg` | Original filename |
| `x-amz-meta-content-category` | `image` | Detected category |
| `x-amz-meta-mime-type` | `image/jpeg` | MIME type |
| `x-amz-meta-file-size-bytes` | `4521984` | File size |

The S3 object's native `LastModified` is the upload timestamp. The `file-last-modified` metadata preserves when the file was actually created/modified on the user's device (e.g., when a photo was taken).

---

## Video Analysis Pipeline

### How It Works

1. User uploads a video → lands in `videos/2026/03/05/bodycam.mp4`
2. S3 event notification triggers the pipeline Lambda
3. Step Functions orchestrates three steps:
   - **AudioAnalyzer**: FFmpeg `silencedetect` identifies silent vs. audio segments
   - **NovaAnalyzer**: Amazon Nova Pro analyzes non-silent segments for scene descriptions
   - **ResultsAggregator**: Combines results → writes to S3 + DynamoDB
4. User clicks "Analyze Video" action in StorageBrowser → sees results

### Example Output

```json
{
  "uploadId": "videos_2026_03_05_bodycam.mp4",
  "duration": 765.0,
  "segments": [
    {
      "start": 0.0, "end": 148.5,
      "has_audio": false,
      "description": "Officer walking toward vehicle, no conversation",
      "classification": "approach",
      "actionable": false
    },
    {
      "start": 148.5, "end": 495.0,
      "has_audio": true,
      "description": "Officer speaking with driver, license exchange",
      "classification": "interaction",
      "actionable": true
    },
    {
      "start": 495.0, "end": 765.0,
      "has_audio": false,
      "description": "Officer returning to patrol vehicle, writing citation",
      "classification": "processing",
      "actionable": false
    }
  ],
  "summary": {
    "totalDuration": "765.0s",
    "actionableDuration": "346.5s",
    "actionablePercent": "45%",
    "totalSegments": 3,
    "actionableSegments": 1
  }
}
```

---

## Deployment

### Prerequisites

- AWS account with permissions to create Cognito, S3, CloudFront, IAM resources
- Node.js 18+ installed
- AWS CLI configured with a profile (`aws configure`)
- Amplify CLI installed:
  ```bash
  npm install -g @aws-amplify/cli
  ```

### Step 1: Clone and Install

```bash
cd ~/s3upload-v2
npm install
```

### Step 2: Initialize Amplify

```bash
amplify init
```

When prompted:
| Prompt | Answer |
|--------|--------|
| Enter a name for the project | `s3uploadv2` |
| Initialize the project with the above configuration? | `Yes` |
| Select the authentication method | `AWS profile` |
| Please choose the profile you want to use | `default` |

### Step 3: Add Authentication (Cognito)

```bash
amplify add auth
```

| Prompt | Answer |
|--------|--------|
| Do you want to use the default authentication and security configuration? | `Default configuration` |
| How do you want users to be able to sign in? | `Username` |
| Do you want to configure advanced settings? | `No, I am done` |

### Step 4: Add Storage (S3 Bucket)

```bash
amplify add storage
```

| Prompt | Answer |
|--------|--------|
| Select from one of the below mentioned services | `Content (Images, audio, video, etc.)` |
| Provide a friendly name | `s3uploadv2storage` (or accept default) |
| Provide bucket name | Accept default or enter a unique name — **note this name for Step 7** |
| Who should have access | `Auth users only` |
| What kind of access for Authenticated users? | Select `create/update`, `read`, `delete` (space bar to select, enter to confirm) |
| Do you want to add a Lambda Trigger? | `No` |

### Step 5: Add Hosting (CloudFront + S3)

```bash
amplify hosting add
```

| Prompt | Answer |
|--------|--------|
| Select the plugin module to execute | `Amazon CloudFront and S3` |
| Select the environment setup | `DEV` (or `PROD` for production) |
| Hosting bucket name | Accept default or enter a unique name |

### Step 6: Deploy

```bash
# Push backend resources (Cognito + S3 bucket)
amplify push
# Answer Yes when asked to continue

# Build frontend and deploy to CloudFront
amplify publish
# Answer Yes when asked to continue
```

After `amplify publish` completes, you'll see:
```
✔ Deployment complete!
https://dxxxxxxxxxx.cloudfront.net
```

**That URL is your app.** Open it in a browser. Sign-up is disabled by default — create users manually in the Cognito console, or remove the `.amplify-tabs { display: none; }` CSS rule to enable self-registration.

### Step 7: Video Analysis Pipeline (Optional)

Only needed if you want the AI-powered video intelligence feature (FFmpeg + Amazon Nova).

```bash
# Get your S3 bucket name from Step 4
# You can find it in src/aws-exports.js → aws_user_files_s3_bucket

aws cloudformation deploy \
  --template-file video-pipeline.yaml \
  --stack-name s3upload-video-pipeline \
  --parameter-overrides BucketName=YOUR_BUCKET_NAME_FROM_STEP_4 \
  --capabilities CAPABILITY_IAM
```

Then add an S3 event notification on your bucket (AWS Console → S3 → your bucket → Properties → Event notifications → Create):

| Setting | Value |
|---------|-------|
| Event name | `video-upload-trigger` |
| Prefix | `protected/` |
| Suffix | `.mp4` (repeat for `.mov`, `.avi`, etc. or leave blank for all) |
| Event types | `s3:ObjectCreated:*` |
| Destination | Lambda function → select `{stack-name}-trigger` |

**FFmpeg Lambda Layer**: The AudioAnalyzer Lambda needs FFmpeg. Options:
1. Search "FFmpeg" in the [AWS Serverless Application Repository](https://serverlessrepo.aws.amazon.com/applications) for a public layer
2. Build your own: download a static FFmpeg binary for Amazon Linux, package as a Lambda layer
3. For videos longer than ~10 minutes, swap the AudioAnalyzer to an ECS Fargate task (Lambda has a 15-min timeout)

**Bedrock Model Access**: Ensure Amazon Nova Pro (or your chosen model) is enabled in your AWS account:
- AWS Console → Amazon Bedrock → Model access → Request access to Amazon Nova Pro

### Redeployment

After making code changes:
```bash
# Frontend changes only (App.js, components, etc.)
amplify publish

# If you also changed backend (auth, storage config)
amplify push
amplify publish
```

### Teardown

```bash
# Remove video pipeline
aws cloudformation delete-stack --stack-name s3upload-video-pipeline

# Remove Amplify resources (Cognito, S3, CloudFront)
amplify delete
```

---

## Switching to Cloudscape UI

If you prefer the AWS Console-style look (Cloudscape Design System), the original custom components are preserved:

1. Restore the backup files:
   - `FilesBrowser.cloudscape.js.bak` → `FilesBrowser.js`
   - `UploadPanel.cloudscape.js.bak` → `UploadPanel.js`

2. `UploadProgress.js` is already Cloudscape-based and ready to use

3. Swap `App.js` to import these instead of StorageBrowser

4. Add Cloudscape dependencies back to `package.json`:
   ```json
   "@cloudscape-design/components": "^3.0.316",
   "@cloudscape-design/global-styles": "^1.0.10"
   ```

The `services/` folder (uploadStateManager, resumableUpload) was built for the Cloudscape version and provides true pause/resume with localStorage persistence.

---

## How the Code Flows

```
User opens app
  → Authenticator (Cognito login)
  → App.js renders header + StorageBrowser

User selects files to upload
  → StorageBrowser's UploadView handles file selection (drag-drop or picker)
  → Our upload override in StorageBrowserConfig.js intercepts
  → fileClassifier.js detects MIME type → builds routed S3 key
  → Default upload handler executes with the rewritten key
  → File lands in images/2026/03/05/photo.jpg (not the original path)

User browses files
  → StorageBrowser's LocationDetailView (built-in table, search, preview)
  → Click image → inline preview
  → Click video → inline video player
  → Click file → download

User selects a video → clicks "Analyze Video"
  → AnalyzeVideoView.js renders
  → Polls S3 for analysis/{uploadId}/results.json
  → If pipeline is done → opens results in new tab
  → If not done → shows "still processing" message

Network drops
  → NetworkStatus.js detects offline
  → Red banner appears: "You are offline"
  → Banner disappears when connection restores
```
