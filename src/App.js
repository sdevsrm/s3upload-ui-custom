import React, {useState, useRef, useEffect} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import {
    AppLayout,
    ContentLayout,
    SideNavigation,
    Header,
    SpaceBetween,
    Link,
    Button,
    Alert,
    ProgressBar,
    FormField,
    TokenGroup,
    Container,
    TopNavigation,
    Box,
    Table,
    BreadcrumbGroup
} from "@cloudscape-design/components";
import {Amplify, Auth, Storage} from 'aws-amplify';
import {Authenticator} from '@aws-amplify/ui-react';

import awsconfig from './aws-exports';

Amplify.configure(awsconfig);

const appLayoutLabels = {
    navigation: 'Side navigation',
    navigationToggle: 'Open side navigation',
    navigationClose: 'Close side navigation',
    notifications: 'Notifications',
    tools: 'Help panel',
    toolsToggle: 'Open help panel',
    toolsClose: 'Close help panel'
};

const ServiceNavigation = () => {
    const location = useLocation();
    let navigate = useNavigate();

    function onFollowHandler(event) {
        if (!event.detail.external) {
            event.preventDefault();
            navigate(event.detail.href);
        }
    }

    return (
        <SideNavigation
            activeHref={location.pathname}
            header={null} // Remove the header here
            onFollow={onFollowHandler}
            items={[
                {type: "link", text: "Upload", href: "/"},
                {type: "divider"},
                {
                    type: "link",
                    text: "AWS Solutions Architect",
                    href: "https://workshops.aws",
                    external: true
                }
            ]}
        />
    );
}

function formatBytes(a, b = 2, k = 1024) {
    if (a === 0) return "0 Bytes";
    if (!a) return "N/A";
    let d = Math.floor(Math.log(a) / Math.log(k));
    return parseFloat((a / Math.pow(k, d)).toFixed(Math.max(0, b))) + " " + ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"][d];
}

const BucketNavigation = ({ currentPath, contents, onNavigate, onDelete }) => {
    return (
        <Table
            items={contents}
            loadingText="Loading bucket contents..."
            columnDefinitions={[
                {
                    id: 'name',
                    header: 'Name',
                    cell: item => (
                        <Link
                            onFollow={() => onNavigate(item.key, item.isFolder)}
                        >
                            {item.isFolder ? '📁 ' : '📄 '}
                            {item.displayName}
                        </Link>
                    ),
                    sortingField: 'displayName'
                },
                {
                    id: 'lastModified',
                    header: 'Last modified',
                    cell: item => item.lastModified ? new Date(item.lastModified).toLocaleString() : '-'
                },
                {
                    id: 'size',
                    header: 'Size',
                    cell: item => item.isFolder ? '-' : formatBytes(item.size)
                },
                {
                    id: 'actions',
                    header: 'Actions',
                    cell: item => (
                        <Button
                            onClick={() => onDelete(item.key)}
                            variant="link"
                        >
                            Delete
                        </Button>
                    )
                }
            ]}
            sortingDisabled={false}
            empty={
                <Box textAlign="center" color="inherit">
                    <b>No files</b>
                    <Box
                        padding={{ bottom: "s" }}
                        variant="p"
                        color="inherit"
                    >
                        This folder is empty
                    </Box>
                </Box>
            }
        />
    );
};
const Content = () => {
    const fileInput = useRef(null);
    const folderInput = useRef(null);
    const [visibleAlert, setVisibleAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [uploadList, setUploadList] = useState([]);
    const [fileList, setFileList] = useState([]);
    const [historyList, setHistoryList] = useState([]);
    const [historyCount, setHistoryCount] = useState(0);
    const [currentPath, setCurrentPath] = useState('');
    const [bucketContents, setBucketContents] = useState([]);
    const [bucketName, setBucketName] = useState('');
    const [viewingBucket, setViewingBucket] = useState(false);
    const maxFileSize = 5 * 1024 * 1024 * 1024; // 5GB in bytes

    useEffect(() => {
        try {
            const bucket = awsconfig.aws_user_files_s3_bucket;
            setBucketName(bucket || 'Bucket name not found');
        } catch (error) {
            console.error('Error getting bucket name:', error);
            setBucketName('Error loading bucket name');
        }
    }, []);

    const listBucketContents = async (path = '') => {
        try {
            console.log('Listing contents for path:', path);
            const result = await Storage.list(path, { 
                level: 'protected',
                pageSize: 1000
            });
            
            console.log('Raw S3 response:', result);
            const items = result.results || [];
            const processedItems = new Map();
            
            // First pass: Process .keep files to identify all folders
            items.forEach(item => {
                if (item.key.endsWith('/.keep')) {
                    const folderPath = item.key.slice(0, -5); // Remove '/.keep'
                    const parts = folderPath.split('/');
                    const currentLevelFolder = path 
                        ? parts[path.split('/').length] 
                        : parts[0];

                    if (currentLevelFolder) {
                        console.log('Processing folder:', currentLevelFolder);
                        processedItems.set(currentLevelFolder, {
                            key: path ? `${path}/${currentLevelFolder}` : currentLevelFolder,
                            displayName: currentLevelFolder,
                            size: 0,
                            isFolder: true,
                            lastModified: item.lastModified
                        });
                    }
                }
            });

            // Second pass: Process regular files and implicit folders
            items.forEach(item => {
                if (!item.key || item.key.endsWith('/.keep')) return;

                const relativePath = path 
                    ? item.key.replace(path + '/', '') 
                    : item.key;
                const parts = relativePath.split('/');

                // Handle current level items
                if (parts.length === 1) {
                    // This is a file in current directory
                    console.log('Processing file:', parts[0]);
                    processedItems.set(parts[0], {
                        key: item.key,
                        displayName: parts[0],
                        size: item.size,
                        isFolder: false,
                        lastModified: item.lastModified
                    });
                } else if (parts.length > 1) {
                    // This indicates a subfolder
                    const folderName = parts[0];
                    if (!processedItems.has(folderName)) {
                        console.log('Processing implicit folder:', folderName);
                        processedItems.set(folderName, {
                            key: path ? `${path}/${folderName}` : folderName,
                            displayName: folderName,
                            size: 0,
                            isFolder: true,
                            lastModified: item.lastModified
                        });
                    }
                }
            });

            const contents = Array.from(processedItems.values())
                .sort((a, b) => {
                    // Folders first, then files
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;
                    return a.displayName.localeCompare(b.displayName);
                });

            console.log('Final processed contents:', contents);
            setBucketContents(contents);
        } catch (error) {
            console.error('Error listing bucket contents:', error);
            setAlertMessage(`Error listing contents: ${error.message}`);
            setVisibleAlert(true);
        }
    };

    const goToParentFolder = () => {
        if (!currentPath) {
            setViewingBucket(false);
            return;
        }
        
        const parentPath = currentPath.split('/').slice(0, -1).join('/');
        console.log('Going to parent folder:', parentPath);
        setCurrentPath(parentPath);
        listBucketContents(parentPath);
    };
    const createNewFolder = async () => {
        const folderName = prompt('Enter folder name:');
        if (!folderName) return;

        const cleanFolderName = folderName.trim().replace(/^\/+|\/+$/g, '');
        
        if (cleanFolderName) {
            try {
                const folderPath = currentPath 
                    ? `${currentPath}/${cleanFolderName}`
                    : cleanFolderName;
                
                console.log('Creating folder at path:', folderPath);
                
                // First check if folder already exists
                const existingCheck = await Storage.list(`${folderPath}/`, {
                    level: 'protected',
                    pageSize: 1
                });

                if (existingCheck.results && existingCheck.results.length > 0) {
                    setAlertMessage('Folder already exists');
                    setVisibleAlert(true);
                    return;
                }

                // Create .keep file in the new folder
                await Storage.put(`${folderPath}/.keep`, '', {
                    level: 'protected',
                    contentType: 'text/plain'
                });
                
                console.log('Folder created successfully');
                console.log('Current path:', currentPath);
                
                // Force a refresh of the current directory
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for S3 consistency
                await listBucketContents(currentPath);
                
            } catch (error) {
                console.error('Error creating folder:', error);
                setAlertMessage(`Error creating folder: ${error.message}`);
                setVisibleAlert(true);
            }
        }
    };

    const deleteFile = async (key) => {
        try {
            if (key.endsWith('/') || !key.includes('.')) {
                // It's a folder
                console.log('Deleting folder:', key);
                
                // List all contents of the folder
                const folderContents = await Storage.list(key, { 
                    level: 'protected',
                    pageSize: 1000
                });

                // Delete all contents including .keep files
                for (const item of folderContents.results) {
                    console.log('Deleting item:', item.key);
                    await Storage.remove(item.key, { level: 'protected' });
                }

                // Also try to delete the .keep file if it exists
                try {
                    await Storage.remove(`${key}/.keep`, { level: 'protected' });
                } catch (e) {
                    console.log('No .keep file found');
                }

            } else {
                // It's a regular file
                console.log('Deleting file:', key);
                await Storage.remove(key, { level: 'protected' });
            }
            
            // Refresh the current directory listing
            await listBucketContents(currentPath);
            
        } catch (error) {
            console.error('Error deleting:', error);
            setAlertMessage(`Error deleting ${key}`);
            setVisibleAlert(true);
        }
    };

    const handleFileSelect = (e, isFolder = false) => {
        e.preventDefault();
        let tempUploadList = [];
        let totalSize = 0;
        
        const files = e.target.files;
        for (let i = 0; i < files.length; i++) {
            totalSize += files[i].size;
            
            if (files[i].size > maxFileSize) {
                setAlertMessage(`File ${files[i].name} is larger than 5GB`);
                setVisibleAlert(true);
                return;
            }
        }
        
        if (totalSize > maxFileSize) {
            setAlertMessage('Total upload size exceeds 5GB');
            setVisibleAlert(true);
            return;
        }
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let path = isFolder ? file.webkitRelativePath : file.name;
            
            tempUploadList.push({
                label: path,
                labelTag: formatBytes(file.size),
                description: 'File type: ' + file.type,
                icon: 'file',
                id: i,
                path: path
            });
        }
        
        setUploadList(tempUploadList);
        setFileList(files);
    };

    function progressBarFactory(fileObject) {
        let localHistory = historyList;
        const id = localHistory.length;
        localHistory.push({
            id: id,
            percentage: 0,
            filename: fileObject.name,
            filetype: fileObject.type,
            filesize: formatBytes(fileObject.size),
            status: 'in-progress'
        });
        setHistoryList(localHistory);
        return (progress) => {
            let tempHistory = historyList.slice();
            const percentage = Math.round((progress.loaded / progress.total) * 100);
            tempHistory[id].percentage = percentage;
            if (percentage === 100) {
                tempHistory[id]['status'] = 'success';
            }
            setHistoryList(tempHistory);
        };
    }
    const handleUpload = async () => {
        if (uploadList.length === 0) {
            setAlertMessage('No files selected');
            setVisibleAlert(true);
            return;
        }

        try {
            for (let i = 0; i < uploadList.length; i++) {
                const file = fileList[i];
                const path = currentPath 
                    ? `${currentPath}/${uploadList[i].path}`
                    : uploadList[i].path;
                
                console.log('Uploading to path:', path);
                const progressCallback = progressBarFactory(file);
                
                await Storage.put(path, file, {
                    progressCallback,
                    level: "protected"
                });
            }
            
            setUploadList([]);
            // Add a small delay before refreshing to ensure S3 consistency
            setTimeout(() => {
                listBucketContents(currentPath);
            }, 1000);
            
        } catch (error) {
            console.error('Upload error:', error);
            setAlertMessage(`Error uploading files: ${error.message}`);
            setVisibleAlert(true);
        }
    };

    const handleDismiss = (itemIndex) => {
        setUploadList([
            ...uploadList.slice(0, itemIndex),
            ...uploadList.slice(itemIndex + 1)
        ]);
    };

    const List = ({list}) => (
        <>
            {list.map((item) => (
                <ProgressBar
                    key={item.id}
                    status={item.status}
                    value={item.percentage}
                    variant="standalone"
                    additionalInfo={item.filesize}
                    description={item.filetype}
                    label={item.filename}
                />
            ))}
        </>
    );

    return (
        <ContentLayout
            header={
                <SpaceBetween size="m">
                    <Header
                        variant="h1"
                        info={<Link>Info</Link>}
                        description="Web application to upload files to S3"
                    >
                        {viewingBucket ? bucketName : 'S3 Buckets'}
                    </Header>
                </SpaceBetween>
            }
        >
            <SpaceBetween size="l">
                {!viewingBucket ? (
                    // Show bucket list
                    <Container
                        header={
                            <Header variant="h2">
                                Buckets
                            </Header>
                        }
                    >
                        <Table
                            items={[
                                {
                                    name: bucketName,
                                    creationDate: new Date().toLocaleDateString(),
                                    region: awsconfig.aws_user_files_s3_bucket_region
                                }
                            ]}
                            columnDefinitions={[
                                {
                                    id: 'name',
                                    header: 'Name',
                                    cell: item => (
                                        <Link
                                            onFollow={() => {
                                                console.log('Entering bucket view');
                                                setViewingBucket(true);
                                                setCurrentPath('');
                                                listBucketContents('');
                                            }}
                                        >
                                            {item.name}
                                        </Link>
                                    )
                                },
                                {
                                    id: 'region',
                                    header: 'Region',
                                    cell: item => item.region
                                },
                                {
                                    id: 'creationDate',
                                    header: 'Creation date',
                                    cell: item => item.creationDate
                                }
                            ]}
                        />
                    </Container>
                ) : (
                    // Show bucket contents
                    <>
                        <Container
                            header={
                                <Header
                                    variant="h2"
                                    actions={
                                        <div className="action-buttons">
                                            {currentPath && (
                                                <Button
                                                    onClick={goToParentFolder}
                                                    iconName="arrow-up"
                                                >
                                                    Up
                                                </Button>
                                            )}
                                            <Button
                                                onClick={() => listBucketContents(currentPath)}
                                                iconName="refresh"
                                            >
                                                Refresh
                                            </Button>
                                            <Button
                                                onClick={createNewFolder}
                                                iconName="folder"
                                            >
                                                Create Folder
                                            </Button>
                                            <Button
                                                onClick={() => fileInput.current.click()}
                                                iconName="upload"
                                            >
                                                Add Files
                                            </Button>
                                            <Button
                                                onClick={() => folderInput.current.click()}
                                                iconName="folder"
                                            >
                                                Add Folder
                                            </Button>
                                        </div>
                                    }
                                >
                                    <BreadcrumbGroup
                                        items={[
                                            { text: bucketName, href: '#', onClick: () => {
                                                console.log('Navigating to bucket root');
                                                setCurrentPath('');
                                                listBucketContents('');
                                            }},
                                            ...(currentPath ? currentPath.split('/').map((part, index, array) => ({
                                                text: part,
                                                href: '#',
                                                onClick: () => {
                                                    const newPath = array.slice(0, index + 1).join('/');
                                                    console.log('Navigating to:', newPath);
                                                    setCurrentPath(newPath);
                                                    listBucketContents(newPath);
                                                }
                                            })) : [])
                                        ]}
                                    />
                                </Header>
                            }
                        >
                            <input
                                type="file"
                                ref={fileInput}
                                onChange={(e) => handleFileSelect(e, false)}
                                style={{display: 'none'}}
                                multiple
                            />
                            <input
                                type="file"
                                ref={folderInput}
                                onChange={(e) => handleFileSelect(e, true)}
                                style={{display: 'none'}}
                                webkitdirectory=""
                                directory=""
                                multiple
                            />
                            
                            {visibleAlert && (
                                <Alert
                                    onDismiss={() => setVisibleAlert(false)}
                                    dismissAriaLabel="Close alert"
                                    dismissible
                                    type="error"
                                    header="Error"
                                >
                                    {alertMessage}
                                </Alert>
                            )}

                            <BucketNavigation
                                currentPath={currentPath}
                                contents={bucketContents}
                                onNavigate={(key, isFolder) => {
                                    if (isFolder) {
                                        // Ensure clean path without trailing slashes or .keep
                                        const normalizedKey = key.replace(/\/\.keep$|\/$/, '');
                                        console.log('Navigating to folder:', normalizedKey);
                                        setCurrentPath(normalizedKey);
                                        listBucketContents(normalizedKey);
                                    } else {
                                        Storage.get(key, { level: 'protected' })
                                            .then(url => window.open(url, '_blank'))
                                            .catch(error => {
                                                console.error('Error downloading file:', error);
                                                setAlertMessage(`Error downloading file: ${error.message}`);
                                                setVisibleAlert(true);
                                            });
                                    }
                                }}
                                onDelete={deleteFile}
                            />

                            {uploadList.length > 0 && (
                                <>
                                    <TokenGroup
                                        onDismiss={({detail: {itemIndex}}) => handleDismiss(itemIndex)}
                                        items={uploadList}
                                        alignment="vertical"
                                        limit={10}
                                    />
                                    <Button variant="primary" onClick={handleUpload}>
                                        Upload Selected
                                    </Button>
                                </>
                            )}
                        </Container>

                        <Container
                            header={
                                <Header variant="h2">
                                    History
                                </Header>
                            }
                        >
                            <List list={historyList}/>
                        </Container>
                    </>
                )}
            </SpaceBetween>
        </ContentLayout>
    );
};

function App() {
    const [navigationOpen, setNavigationOpen] = useState(false);
    const navbarItemClick = e => {
        console.log(e);
        if (e.detail.id === 'signout') {
            Auth.signOut().then(() => {
                window.location.reload();
            });
        }
    }

    return (
        <Authenticator>
            {({signOut, user}) => (
                <>
                    <div id="navbar" style={{fontSize: 'body-l !important', position: 'sticky', top: 0, zIndex: 1002}}>
                        <TopNavigation
                            identity={{
                                href: "#",
                                title: "S3 Object Upload Tool",
                                logo: {
                                    src: "data:image/svg+xml;base64,//48AD8AeABtAGwAIAB2AGUAcgBzAGkAbwBuAD0AIgAxAC4AMAAiACAAZQBuAGMAbwBkAGkAbgBnAD0AIgB1AHQAZgAtADEANgAiAD8APgANAAoAPAAhAC0ALQAgAEcAZQBuAGUAcgBhAHQAbwByADoAIABBAGQAbwBiAGUAIABJAGwAbAB1AHMAdAByAGEAdABvAHIAIAAxADQALgAwAC4AMAAsACAAUwBWAEcAIABFAHgAcABvAHIAdAAgAFAAbAB1AGcALQBJAG4AIAAuACAAUwBWAEcAIABWAGUAcgBzAGkAbwBuADoAIAA2AC4AMAAwACAAQgB1AGkAbABkACAANAAzADMANgAzACkAIAAgAC0ALQA+AA0ACgA8ACEARABPAEMAVABZAFAARQAgAHMAdgBnACAAUABVAEIATABJAEMAIAAiAC0ALwAvAFcAMwBDAC8ALwBEAFQARAAgAFMAVgBHACAAMQAuADEALwAvAEUATgAiACAAIgBoAHQAdABwADoALwAvAHcAdwB3AC4AdwAzAC4AbwByAGcALwBHAHIAYQBwAGgAaQBjAHMALwBTAFYARwAvADEALgAxAC8ARABUAEQALwBzAHYAZwAxADEALgBkAHQAZAAiAD4ADQAKADwAcwB2AGcAIAB2AGUAcgBzAGkAbwBuAD0AIgAxAC4AMQAiACAAaQBkAD0AIgBMAGEAeQBlAHIAXwAxACIAIAB4AG0AbABuAHMAPQAiAGgAdAB0AHAAOgAvAC8AdwB3AHcALgB3ADMALgBvAHIAZwAvADIAMAAwADAALwBzAHYAZwAiACAAeABtAGwAbgBzADoAeABsAGkAbgBrAD0AIgBoAHQAdABwADoALwAvAHcAdwB3AC4AdwAzAC4AbwByAGcALwAxADkAOQA5AC8AeABsAGkAbgBrACIAIAB4AD0AIgAwAHAAeAAiACAAeQA9ACIAMABwAHgAIgANAAoACQAgAHcAaQBkAHQAaAA9ACIANwAwAHAAeAAiACAAaABlAGkAZwBoAHQAPQAiADcAMABwAHgAIgAgAHYAaQBlAHcAQgBvAHgAPQAiADAAIAAwACAANwAwACAANwAwACIAIABlAG4AYQBiAGwAZQAtAGIAYQBjAGsAZwByAG8AdQBuAGQAPQAiAG4AZQB3ACAAMAAgADAAIAA3ADAAIAA3ADAAIgAgAHgAbQBsADoAcwBwAGEAYwBlAD0AIgBwAHIAZQBzAGUAcgB2AGUAIgA+AA0ACgA8AGcAPgANAAoACQA8AGcAPgANAAoACQAJADwAZwA+AA0ACgAJAAkACQA8AGcAPgANAAoACQAJAAkACQA8AHAAYQB0AGgAIABmAGkAbABsAC0AcgB1AGwAZQA9ACIAZQB2AGUAbgBvAGQAZAAiACAAYwBsAGkAcAAtAHIAdQBsAGUAPQAiAGUAdgBlAG4AbwBkAGQAIgAgAGYAaQBsAGwAPQAiACMAMQA0ADYARQBCADQAIgAgAGQAPQAiAE0ANgAzAC4AOQA1ACwAMQA1AC4ANwA4ADYAYwAwACwANAAuADAAMAA2AC0AMQAyAC4AOQA2ADMALAA3AC4AMgAzADgALQAyADgALgA5ADQAOQAsADcALgAyADMAOAANAAoACQAJAAkACQAJAGMALQAxADUALgA5ADgAOAAsADAALQAyADgALgA5ADUAMQAtADMALgAyADMAMgAtADIAOAAuADkANQAxAC0ANwAuADIAMwA4AGwAOQAuADYANQAsADQAMwAuADgAMwA5AGMAMAAsADIALgA2ADcAMgAsADgALgA2ADMANwAsADQALgA4ADIANgAsADEAOQAuADMAMAAxACwANAAuADgAMgA2AGMAMQAwAC4ANgA2ADIALAAwACwAMQA5AC4AMgA5ADkALQAyAC4AMQA1ADQALAAxADkALgAyADkAOQAtADQALgA4ADIANgBsADAALAAwAA0ACgAJAAkACQAJAAkATAA2ADMALgA5ADUALAAxADUALgA3ADgANgB6ACIALwA+AA0ACgAJAAkACQA8AC8AZwA+AA0ACgAJAAkACQA8AGcAPgANAAoACQAJAAkACQA8AHAAYQB0AGgAIABmAGkAbABsAC0AcgB1AGwAZQA9ACIAZQB2AGUAbgBvAGQAZAAiACAAYwBsAGkAcAAtAHIAdQBsAGUAPQAiAGUAdgBlAG4AbwBkAGQAIgAgAGYAaQBsAGwAPQAiACMAMQA0ADYARQBCADQAIgAgAGQAPQAiAE0ANgAzAC4AOQA1ACwAMQAyAC4ANwA4ADYAYwAwAC0ANAAuADAAMAA0AC0AMQAyAC4AOQA2ADMALQA3AC4AMgAzADcALQAyADgALgA5ADQAOQAtADcALgAyADMANwANAAoACQAJAAkACQAJAGMALQAxADUALgA5ADgAOAAsADAALQAyADgALgA5ADUAMQAsADMALgAyADMAMwAtADIAOAAuADkANQAxACwANwAuADIAMwA3AGMAMAAsADQALgAwADAANgAsADEAMgAuADkANgAzACwANwAuADIAMwA4ACwAMgA4AC4AOQA1ADEALAA3AC4AMgAzADgAQwA1ADAALgA5ADgANwAsADIAMAAuADAAMgA0ACwANgAzAC4AOQA1ACwAMQA2AC4ANwA5ADIALAA2ADMALgA5ADUALAAxADIALgA3ADgANgBMADYAMwAuADkANQAsADEAMgAuADcAOAA2AA0ACgAJAAkACQAJAAkAegAiAC8APgANAAoACQAJAAkAPAAvAGcAPgANAAoACQAJADwALwBnAD4ADQAKAAkAPAAvAGcAPgANAAoAPAAvAGcAPgANAAoAPAAvAHMAdgBnAD4ADQAKAA==",
                                    alt: "S3 Object Upload tool"
                                }
                            }}
                            utilities={[
                                {
                                    type: "button",
                                    text: "AWS",
                                    href: "https://aws.amazon.com/",
                                    external: true,
                                    externalIconAriaLabel: " (opens in a new tab)"
                                },
                                {
                                    type: "menu-dropdown",
                                    text: user.username,
                                    description: user.username,
                                    iconName: "user-profile",
                                    onItemClick: navbarItemClick,
                                    items: [
                                        {id: "profile", text: "Profile"},
                                        {id: "preferences", text: "Preferences"},
                                        {id: "security", text: "Security"},
                                        {
                                            id: "feedback",
                                            text: "Feedback",
                                            href: "#",
                                            external: true,
                                            externalIconAriaLabel: " (opens in new tab)"
                                        },
                                        {id: "signout", text: "Sign out"}
                                    ]
                                }
                            ]}
                            i18nStrings={{
                                searchIconAriaLabel: "Search",
                                searchDismissIconAriaLabel: "Close search",
                                overflowMenuTriggerText: "More"
                            }}
                        />
                    </div>
                    <AppLayout
                        content={<Content/>}
                        headerSelector='#navbar'
                        navigation={<ServiceNavigation/>}
                        navigationOpen={navigationOpen}
                        onNavigationChange={({detail}) => setNavigationOpen(detail.open)}
                        ariaLabels={appLayoutLabels}
                    />
                </>
            )}
        </Authenticator>
    );
}

export default App;