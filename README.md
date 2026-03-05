# Simple S3 Web Application to upload multiple files

[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## About

This repository contains the Open Source Software to demonstrate how to build a simple WebApp to users upload files to S3.

### Built With

- [AWS Amplify Framework](https://docs.amplify.aws/)
- [Amazon S3](https://aws.amazon.com/s3/)
- [Amazon Cognito](https://aws.amazon.com/cognito/)
- [AWS Cloudscape Design System](https://github.com/aws/awsui-documentation)
- [Node.JS](https://nodejs.org/en/)
- [React](https://reactjs.org/)

## Architecture

```
                              ┌──────────────┐
                              │    User       │
                              │  (Browser)    │
                              └──────┬───────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  Amazon CloudFront   │
                          │  + S3 (Hosting)      │
                          │                      │
                          │  Static React App    │
                          │  (amplify publish)   │
                          └─────────┬───────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────┐
│                React App (Client-Side)                     │
│                                                            │
│  ┌──────────────────┐  ┌───────────────────────────────┐  │
│  │ Cloudscape UI    │  │ AWS Amplify SDK v5            │  │
│  │ Design System    │  │                               │  │
│  │                  │  │  - Authenticator (Auth)       │  │
│  │  - AppLayout     │  │  - Storage (S3 operations)   │  │
│  │  - Table         │  │  - Amplify.configure()       │  │
│  │  - Modal         │  │                               │  │
│  │  - ProgressBar   │  └───────┬───────────┬──────────┘  │
│  │  - TopNavigation │          │           │              │
│  │  - BreadcrumbGroup│         │           │              │
│  └──────────────────┘          │           │              │
│                                │           │              │
│  ┌─────────────────────────────┘           │              │
│  │ Upload Engine                           │              │
│  │  - UploadStateManager (localStorage)    │              │
│  │  - MultipartUploadHandler               │              │
│  │  - 512MB chunks, 4 concurrent           │              │
│  │  - Retry with exponential backoff       │              │
│  └─────────────────────────────────────────┘              │
└────────────────────┬──────────────────┬───────────────────┘
                     │                  │
          Auth Flow  │                  │  Storage Operations
                     ▼                  ▼
          ┌──────────────────┐  ┌──────────────────────────┐
          │  Amazon Cognito  │  │      Amazon S3           │
          │                  │  │                          │
          │  ┌────────────┐  │  │  Bucket Structure:       │
          │  │ User Pool  │  │  │                          │
          │  │            │  │  │  protected/              │
          │  │ Username/  │  │  │  └── {identityId}/       │
          │  │ Password   │  │  │      ├── folder-a/       │
          │  └────────────┘  │  │      │   ├── .keep       │
          │                  │  │      │   └── file1.pdf   │
          │  ┌────────────┐  │  │      ├── folder-b/       │
          │  │ Identity   │  │  │      │   └── data.csv    │
          │  │ Pool       │──┼──│      └── report.xlsx     │
          │  │            │  │  │                          │
          │  │ Temp AWS   │  │  │  Features:               │
          │  │ Credentials│  │  │  - Per-user isolation     │
          │  └────────────┘  │  │  - Multipart (up to 5TB) │
          │                  │  │  - Presigned URL download │
          └──────────────────┘  └──────────────────────────┘
```

### Component Architecture

```
App (Authenticator wrapper)
├── TopNavigation (sign out)
├── AppLayout
│   ├── ServiceNavigation (sidebar)
│   │   └── Upload Files link
│   └── Content
│       ├── Bucket List View (entry point)
│       ├── File Browser View
│       │   ├── BreadcrumbGroup (path navigation)
│       │   ├── Action Bar
│       │   │   ├── Up / Refresh / Create Folder
│       │   │   └── Add Files / Add Folder
│       │   ├── Table (files & folders)
│       │   │   ├── Click folder → navigate
│       │   │   ├── Click file → presigned URL download
│       │   │   └── Delete action (with confirmation modal)
│       │   └── Upload Panel
│       │       ├── TokenGroup (selected files)
│       │       └── Upload button
│       └── UploadProgress
│           ├── Per-file progress bar
│           ├── Speed / ETA / elapsed time
│           └── Retry failed parts
└── ErrorBoundary (crash recovery)
```

### Data Flow

```
Upload:   Browser → Amplify SDK → Cognito credentials → S3 PutObject (protected/{identityId}/path)
Download: Browser → Amplify SDK → S3 presigned URL → new browser tab
Delete:   Browser → Amplify SDK → S3 DeleteObject (folder: recursive delete + .keep marker)
Browse:   Browser → Amplify SDK → S3 ListObjectsV2 (prefix) → client-side folder/file processing
```

### Upload Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Chunk Size | 512 MB | Multipart upload chunk size |
| Max Retries | 5 | Per-chunk retry attempts |
| Concurrent Uploads | 4 | Parallel chunk uploads |
| Max File Size | 5 TB | Per-file size limit |
| Stale Cleanup | 24 hours | Auto-cleanup of orphaned upload state |
| Cleanup Interval | 30 minutes | How often cleanup runs |

## User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ 1. OPEN APP                                                  │
│    User navigates to CloudFront URL                          │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. AUTHENTICATE                                              │
│    Cognito login (username/password)                         │
│    Sign-up disabled by default (admin creates users)         │
│    On success → temporary AWS credentials via Identity Pool  │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. VIEW BUCKET                                               │
│    Single S3 bucket shown (from amplify config)              │
│    Click bucket → enter file browser                         │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. BROWSE FILES                                              │
│                                                              │
│    ┌─────────────────────────────────────────────────────┐   │
│    │  Root > project-data > reports                      │   │
│    │                                                     │   │
│    │  📁 drafts              -         2026-03-01        │   │
│    │  📄 summary.pdf      2.1 MB      2026-03-03        │   │
│    │  📄 data.csv        45.2 MB      2026-03-04        │   │
│    │                                                     │   │
│    │  [⬆ Up] [↻ Refresh] [+ Create Folder]              │   │
│    │  [📎 Add Files] [📁 Add Folder]                     │   │
│    └─────────────────────────────────────────────────────┘   │
│                                                              │
│    • Click folder → navigate into it                         │
│    • Click file → download (presigned URL, new tab)          │
│    • Delete → confirmation modal → removes from S3           │
│    • Create Folder → prompt for name → .keep marker in S3    │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. SELECT & UPLOAD FILES                                     │
│                                                              │
│    • "Add Files" → multi-file picker                         │
│    • "Add Folder" → entire folder (preserves structure)      │
│    • Selected files shown as removable tokens                │
│    • Click "Upload" → sequential upload with progress        │
│                                                              │
│    ┌──────────────────────────────────────────────┐          │
│    │ ⚠ Do not close this tab until complete       │          │
│    │                                              │          │
│    │ report.pdf                                   │          │
│    │ ████████████████████░░░░░  78%               │          │
│    │                                              │          │
│    │ Size: 2.1 MB        Speed: 12.45 Mbps       │          │
│    │ Remaining: 2s       Elapsed: 8s              │          │
│    └──────────────────────────────────────────────┘          │
│                                                              │
│    Large files (>512MB): multipart with 4 concurrent chunks, │
│    retry on failure, state persisted to localStorage         │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. COMPLETE                                                  │
│    Progress → 100%, average speed shown                      │
│    File browser auto-refreshes                               │
│    Upload state cleaned from localStorage after 24hrs        │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. SIGN OUT                                                  │
│    Top-right navigation → Sign out → Cognito session cleared │
└─────────────────────────────────────────────────────────────┘
```

## Getting Started

Clone the source code repository using below command from your terminal and navigate to the root of your app directory.

`git clone https://github.com/sdevsrm/s3upload-ui-custom.git`

`cd s3upload-ui-custom/`

![git clone](https://github.com/user-attachments/assets/f5c5db2e-adf3-46dd-b9de-d33212074043)

Install AWS Amplify CLI using below command

`npm install -g @aws-amplify/cli`

![aws amplify cli](https://github.com/user-attachments/assets/5f7e224f-3c69-4dc4-90b0-b1f37fe67b55)

> [!NOTE]
> If `npm` is not installed on your EC2 instance/application server, use the `sudo yum install npm` command to install it.
> It is recommended to run this command from the root of your app directory. In this example, it is "s3upload-ui-custom."
> For the next steps, if you receive a deprecation warning messages such as, 'npm WARN deprecated,' or `(node:19991) [DEP0128] DeprecationWarning: Invalid 'main'` just ignore and press enter to continue.

Inside the root directory/project folder, initialize the project by entering below command

`amplify init`

Select the following parameters:
Enter a name for the project: **s3upload-ui-custom** (it can be any name; if you wish, you can leave defaults). Press enter.
Initialize the project with the above configuration: **Yes**. Press enter.
Select the authentication method you want to use: **AWS profile**. Press Enter.
Please choose the profile you want to use: **default**. Press Enter.

![amplify init](https://github.com/user-attachments/assets/467c9ddb-586d-48a2-962d-50f7f91f9057)

> [!NOTE]
> If there is no profile configured on your EC2 instance, you need to configure the access key and secret key of your AWS account and create a profile to proceed further.

Add the authentication component

`amplify add auth`

Select the following parameters:
For Do you want to use the default authentication and security configuration?, select **Default Configuration**. Press enter.
For How do you want users to be able to sign in?, select **Username**. Press enter to confirm.
For Do you want to configure advanced settings? Select **No**, I am done.

![amplify add auth](https://github.com/user-attachments/assets/f647a54a-df07-4953-af59-89783989e319)

Add the storage component

`amplify add storage`

Select the following parameters:
For Select from one of the below mentioned services, select **Content (Images, audio, video, etc.).** Press enter to confirm.
Provide a friendly name for your resource that will be used to label this category in the project - for example: s35e505e53 **(it can be any name; if you wish, accept the defaults). Press enter.**
Provide bucket name. This is the bucket where users will upload files. For example: s3uploaderxxxxx. **The name must be unique; otherwise, accept the defaults suggested and select enter to confirm. Make a note of this bucket; you use it later.**
Who should have access: Select **Auth users only**, use arrow key to move between the options and hit enter to select.
What kind of access do you want for Authenticated users? Use your arrow key to pick **create/update/delete** and then hit the space bar to select it. Select enter to confirm.
Do you want to add Lambda Trigger for your S3 Bucket? Select **No** and press enter to confirm.

![amplify add storage](https://github.com/user-attachments/assets/f84791c2-0c5f-44c6-972a-7dea82e6cbc0)

Add the application hosting

`amplify hosting add`

> Select Amazon CloudFront and S3. Define a new unique bucket name or use the suggested one.

![amplify hosting add](https://github.com/user-attachments/assets/655c3783-dfe8-4d86-a4e5-8382e047de8d)

Now, you can build the web app (front-end)

```bash
npm install
amplify push
amplify publish
```

![npm install](https://github.com/user-attachments/assets/de01cd62-92c5-4e12-bc58-eaf784254384)
![amplify push](https://github.com/user-attachments/assets/39629769-a77c-4f85-a020-cb92057a4153)
![amplify publish](https://github.com/user-attachments/assets/f5992b88-eac1-44d6-b36a-186c48609363)

The output of the `amplify publish` if all the deployment was done correctly is a URL This URL is the web application URl where you can open from the browser to access your application. By default, the front-end come with the sign-up UI disabled and user has to be created manually in the AWS Cognito service. To enable the sign-up UI you need to change the file: `App.css`

Comment or remove the following block:

```css
.amplify-tabs {
  display: none;
}
```

> After this change or if you make any changes to `App.css` or `App.js` file you need to re-run `amplify publish` or `amplify publish -c`

### Prerequisites

To build this solution you must have:
- AWS account
- Permissions to create resources in the AWS account
- Node.js 16.x or higher

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
