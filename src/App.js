/**
 * Required imports
 */
import React, {useState, useRef, useEffect, useContext, createContext} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import {Amplify, Auth, Storage} from 'aws-amplify';
import {Authenticator} from '@aws-amplify/ui-react';
import awsconfig from './aws-exports';

/**
 * AWS Cloudscape Design System Component imports
 */
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
    BreadcrumbGroup,
    Modal,
    ColumnLayout,
    StatusIndicator,
    Spinner
} from "@cloudscape-design/components";

// Configure Amplify
Amplify.configure(awsconfig);

/**
 * Configuration Constants
 */
const UPLOAD_CONFIG = {
    CHUNK_SIZE: 512 * 1024 * 1024,  // 512MB chunks
    MAX_RETRIES: 5,               // Maximum retry attempts per chunk
    CONCURRENT_UPLOADS: 4,        // Number of concurrent chunk uploads
    MAX_FILE_SIZE: 5 * 1024 * 1024 * 1024 * 1024, // 5TB
    CLEANUP: {
        STALE_THRESHOLD_HOURS: 24,
        CHECK_INTERVAL_MINUTES: 30,
        MAX_STORAGE_SIZE_MB: 10,
        BATCH_SIZE: 50
    },
    PROGRESS_UPDATE_INTERVAL: 1000 // Progress update interval in ms
};

const appLayoutLabels = {
    navigation: 'Side navigation',
    navigationToggle: 'Open side navigation',
    navigationClose: 'Close side navigation',
    notifications: 'Notifications',
    tools: 'Help panel',
    toolsToggle: 'Open help panel',
    toolsClose: 'Close help panel'
};

// Create context for upload state
const UploadStateContext = createContext(null);

/**
 * Utility Functions
 */
function formatBytes(a, b = 2, k = 1024) {
    if (a === 0) return "0 Bytes";
    if (!a) return "N/A";
    let d = Math.floor(Math.log(a) / Math.log(k));
    return parseFloat((a / Math.pow(k, d)).toFixed(Math.max(0, b))) + " " + 
           ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"][d];
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds === 0) return 'Calculating...';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let timeString = '';
    if (hours > 0) timeString += `${hours}h `;
    if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
    timeString += `${remainingSeconds}s`;

    return timeString;
}

/**
 * Custom Event for Upload Progress
 */
class UploadProgressEvent extends CustomEvent {
    constructor(uploadId, progress) {
        super('upload-progress', {
            detail: {
                type: 'upload-progress',
                uploadId,
                progress
            }
        });
    }
}

/**
 * Error Boundary Component
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Content error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Container>
                    <Alert type="error" header="Error">
                        An error occurred. Please refresh the page or try again.
                        {this.state.error && (
                            <div>Error: {this.state.error.message}</div>
                        )}
                        <Button
                            onClick={() => {
                                this.setState({ hasError: false });
                                window.location.reload();
                            }}
                        >
                            Refresh Page
                        </Button>
                    </Alert>
                </Container>
            );
        }

        return this.props.children;
    }
}
/**
 * Upload State Manager Class
 */
class UploadStateManager {
    constructor() {
        this.lastCleanupTime = null;
        this.isCleanupRunning = false;
        this.storagePrefix = 'upload-';
        this.progressListeners = new Map();
        this.activeUploads = new Map();
    }

    init() {
        this.scheduleCleanup();
        window.addEventListener('storage', (e) => {
            if (e.key === 'lastCleanupTime') {
                this.lastCleanupTime = parseInt(e.newValue);
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.checkAndCleanup();
            }
        });
        this.checkAndCleanup();
    }

    cleanup() {
        this.progressListeners.clear();
        this.activeUploads.clear();
    }

    scheduleCleanup() {
        setInterval(() => this.checkAndCleanup(), 
            UPLOAD_CONFIG.CLEANUP.CHECK_INTERVAL_MINUTES * 60 * 1000);
    }

    addProgressListener(uploadId, callback) {
        this.progressListeners.set(uploadId, callback);
    }

    removeProgressListener(uploadId) {
        this.progressListeners.delete(uploadId);
    }

    notifyProgress(uploadId, progress) {
        const callback = this.progressListeners.get(uploadId);
        if (callback) {
            callback(progress);
        }
        window.dispatchEvent(new UploadProgressEvent(uploadId, progress));
    }

    async checkAndCleanup() {
        if (this.isCleanupRunning) return;

        const now = Date.now();
        const lastCleanup = parseInt(localStorage.getItem('lastCleanupTime')) || 0;
        const cleanupNeeded = (now - lastCleanup) > 
            (UPLOAD_CONFIG.CLEANUP.CHECK_INTERVAL_MINUTES * 60 * 1000);

        if (cleanupNeeded) {
            this.isCleanupRunning = true;
            try {
                await this.performCleanup();
                localStorage.setItem('lastCleanupTime', now.toString());
                this.lastCleanupTime = now;
            } finally {
                this.isCleanupRunning = false;
            }
        }
    }

    async performCleanup() {
        console.log('Starting cleanup operation...');
        const states = this.getAllUploadStates();
        const now = Date.now();
        const staleThreshold = now - (UPLOAD_CONFIG.CLEANUP.STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

        for (let i = 0; i < states.length; i += UPLOAD_CONFIG.CLEANUP.BATCH_SIZE) {
            const batch = states.slice(i, i + UPLOAD_CONFIG.CLEANUP.BATCH_SIZE);
            
            for (const { key, state } of batch) {
                if (this.shouldRemoveItem(state, staleThreshold)) {
                    try {
                        if (state?.uploadId) {
                            await this.abortMultipartUpload(state);
                        }
                        localStorage.removeItem(key);
                        console.log(`Cleaned up stale upload state: ${key}`);
                    } catch (error) {
                        console.error(`Cleanup error for ${key}:`, error);
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    shouldRemoveItem(state, staleThreshold) {
        if (!state) return true;
        if (state.completed && state.timestamp < staleThreshold) return true;
        if (state.failed && state.timestamp < staleThreshold) return true;
        return !state.completed && !state.failed && state.timestamp < staleThreshold;
    }

    async abortMultipartUpload(state) {
        if (!state.uploadId || !state.path) return;
        try {
            const upload = this.activeUploads.get(state.uploadId);
            if (upload && upload.abort) {
                await upload.abort();
            }
            await Storage.cancel(state.path, { id: state.uploadId });
            this.activeUploads.delete(state.uploadId);
        } catch (error) {
            console.error('Error aborting multipart upload:', error);
        }
    }

    registerUpload(uploadId, handler) {
        this.activeUploads.set(uploadId, handler);
    }

    unregisterUpload(uploadId) {
        this.activeUploads.delete(uploadId);
    }

    saveUploadState(uploadId, state) {
        const updatedState = {
            ...state,
            lastUpdated: Date.now()
        };
        localStorage.setItem(`${this.storagePrefix}${uploadId}`, JSON.stringify(updatedState));
        this.notifyProgress(uploadId, updatedState);
    }

    getUploadState(uploadId) {
        const state = localStorage.getItem(`${this.storagePrefix}${uploadId}`);
        return state ? JSON.parse(state) : null;
    }

    removeUploadState(uploadId) {
        localStorage.removeItem(`${this.storagePrefix}${uploadId}`);
        this.activeUploads.delete(uploadId);
    }

    getAllUploadStates() {
        const states = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(this.storagePrefix)) {
                try {
                    const state = JSON.parse(localStorage.getItem(key));
                    states.push({ key, state, timestamp: state.startTime || 0 });
                } catch (error) {
                    states.push({ key, state: null, timestamp: 0 });
                }
            }
        }
        return states;
    }

    isUploading() {
        return this.activeUploads.size > 0;
    }

    getActiveUploads() {
        return Array.from(this.activeUploads.values());
    }
}

// Export the UploadStateManager class
export { UploadStateManager };

/**
 * Enhanced MultipartUploadHandler Class
 */
class MultipartUploadHandler {
    constructor(file, path, stateManager, onProgress) {
        this.file = file;
        this.path = path;
        this.stateManager = stateManager;
        this.onProgress = onProgress;
        this.uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.numParts = Math.ceil(file.size / UPLOAD_CONFIG.CHUNK_SIZE);
        this.startTime = Date.now();
        this.bytesUploaded = 0;
        this.uploadSpeed = 0;
        this.lastSpeedUpdate = Date.now();
        this.activeUploads = new Set();
        this.aborted = false;
        this.s3UploadId = null; // To store the S3 multipart upload ID
        this.uploadedParts = []; // New property to track uploaded parts
        this.retryTimeouts = {};
        this.maxRetryDelay = 32000; // 32 seconds
        this.initializePartTracking();
    }

    initializePartTracking() {
        this.parts = Array(this.numParts).fill(null).map((_, index) => ({
            partNumber: index + 1,
            startByte: index * UPLOAD_CONFIG.CHUNK_SIZE,
            endByte: Math.min((index + 1) * UPLOAD_CONFIG.CHUNK_SIZE, this.file.size),
            progress: 0,
            status: 'pending',
            completed: false,
            inProgress: false,
            error: null,
            startTime: null,
            endTime: null,
            bytesUploaded: 0,
            size: Math.min(UPLOAD_CONFIG.CHUNK_SIZE, this.file.size - (index * UPLOAD_CONFIG.CHUNK_SIZE))
        }));
    }

    updatePartProgress(partNumber, progress, status, error = null) {
        const partIndex = partNumber - 1;
        if (this.parts[partIndex]) {
            const now = Date.now();
            this.parts[partIndex] = {
                ...this.parts[partIndex],
                progress,
                status,
                inProgress: status === 'uploading',
                completed: status === 'completed',
                error: error,
                startTime: this.parts[partIndex].startTime || (status === 'uploading' ? now : null),
                endTime: status === 'completed' ? now : null,
                bytesUploaded: (progress / 100) * this.parts[partIndex].size
            };
        }
    }

    updateOverallProgress() {
        const totalBytes = this.file.size;
        const uploadedBytes = this.parts.reduce((total, part) => 
            total + (part.size * (part.progress / 100)), 0
        );
        
        const progress = this.calculateProgress(
            this.parts.filter(p => p.completed).length,
            uploadedBytes
        );
        
        this.onProgress?.(progress);
        this.stateManager.notifyProgress(this.uploadId, progress);
    }    

    calculateProgress(completedParts, bytesUploaded) {
        const now = Date.now();
        const elapsedTime = (now - this.startTime) / 1000; // in seconds
        const totalSize = this.file.size;
        
        // Calculate upload speed (bytes per second)
        const timeSinceLastUpdate = (now - this.lastSpeedUpdate) / 1000;
        if (timeSinceLastUpdate >= 1) {
            this.uploadSpeed = (bytesUploaded - this.bytesUploaded) / timeSinceLastUpdate;
            this.bytesUploaded = bytesUploaded;
            this.lastSpeedUpdate = now;
        }

        // Calculate average speed
        const averageSpeed = bytesUploaded / elapsedTime;

        // Estimate remaining time
        const remainingBytes = totalSize - bytesUploaded;
        const estimatedTimeRemaining = this.uploadSpeed ? remainingBytes / this.uploadSpeed : 0;

        // Calculate part statistics
        const completedPartsCount = this.parts.filter(p => p.completed).length;
        const inProgressPartsCount = this.parts.filter(p => p.inProgress).length;
        const failedPartsCount = this.parts.filter(p => p.error).length;

        return {
            id: this.uploadId,
            filename: this.file.name,
            progress: (bytesUploaded / totalSize) * 100,
            loadedParts: completedPartsCount,
            totalParts: this.numParts,
            bytesUploaded,
            totalSize,
            uploadSpeed: formatBytes(this.uploadSpeed) + '/s',
            averageSpeed: formatBytes(averageSpeed) + '/s',
            estimatedTimeRemaining: formatTime(estimatedTimeRemaining),
            elapsedTime: formatTime(elapsedTime),
            status: this.aborted ? 'aborted' : 'in-progress',
            parts: this.parts,
            statistics: {
                completed: completedPartsCount,
                inProgress: inProgressPartsCount,
                failed: failedPartsCount,
                pending: this.numParts - (completedPartsCount + inProgressPartsCount + failedPartsCount)
            }
        };
    }

    async start() {
        try {
            console.log('Starting upload for:', this.path);
            await this.initializeUpload();
            if (!this.aborted) {
                await this.uploadParts();
                if (!this.aborted) {
                    await this.completeUpload();
                    return true;
                }
            }
            return false;
        } catch (error) {
            await this.handleError(error);
            return false;
        }
    }

    async initializeUpload() {
        try {
            // Start the upload normally
            await Storage.put(this.path, this.file, {
                level: 'protected',
                progressCallback: (progress) => {
                    const progressInfo = this.calculateProgress(1, progress.loaded);
                    this.onProgress?.(progressInfo);
                    this.stateManager.notifyProgress(this.uploadId, progressInfo);
                }
            });

            // Update state after successful upload
            this.stateManager.saveUploadState(this.uploadId, {
                uploadId: this.uploadId,
                path: this.path,
                startTime: Date.now(),
                completed: true,
                failed: false
            });
        } catch (error) {
            console.error('Failed to initialize upload:', error);
            throw error;
        }
    }

    async initializeMultipartUpload() {
        try {
            // Use Storage.put instead of multiPartUpload for initialization
            await Storage.put(
                this.path,
                this.file,
                {
                    level: 'protected',
                    contentType: this.file.type,
                    progressCallback: (progress) => {
                        if (this.aborted) return;
                        
                        const progressInfo = this.calculateProgress(1, progress.loaded);
                        this.onProgress?.(progressInfo);
                        this.stateManager.notifyProgress(this.uploadId, progressInfo);
                    }
                }
            );
            
            // Save the initial state
            this.stateManager.saveUploadState(this.uploadId, {
                uploadId: this.uploadId,
                s3UploadId: this.s3UploadId,
                path: this.path,
                fileSize: this.file.size,
                fileName: this.file.name,
                startTime: Date.now(),
                completed: false,
                failed: false
            });
        } catch (error) {
            console.error('Failed to initialize multipart upload:', error);
            throw error;
        }
    }    

    async uploadParts() {
        const uploadPromises = [];
        const uploadedParts = [];

        for (let partNumber = 1; partNumber <= this.numParts; partNumber++) {
            if (this.aborted) break;

            const start = (partNumber - 1) * UPLOAD_CONFIG.CHUNK_SIZE;
            const end = Math.min(start + UPLOAD_CONFIG.CHUNK_SIZE, this.file.size);
            const chunk = this.file.slice(start, end);

            const uploadPromise = this.uploadPart(chunk, partNumber)
                .then(part => {
                    uploadedParts.push(part);
                    this.updateProgress(uploadedParts.length);
                })
                .catch(error => {
                    this.updatePartProgress(partNumber, 0, 'error', error.message);
                    throw error;
                });

            uploadPromises.push(uploadPromise);

            if (uploadPromises.length >= UPLOAD_CONFIG.CONCURRENT_UPLOADS) {
                await Promise.race(uploadPromises);
                const completedIndex = uploadPromises.findIndex(p => p.status === 'fulfilled');
                if (completedIndex !== -1) {
                    uploadPromises.splice(completedIndex, 1);
                }
            }
        }

        if (!this.aborted) {
            await Promise.all(uploadPromises);
            this.uploadedParts = uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);
        }
    }

    async uploadPart(chunk, partNumber) {
        let retries = 0;
        const maxRetries = UPLOAD_CONFIG.MAX_RETRIES;
        const initialDelay = 1000;

        while (true) {
            try {
                this.activeUploads.add(partNumber);
                this.updatePartProgress(partNumber, 0, 'uploading');

                // Use Storage.put for each part
                const response = await Storage.put(
                    `${this.path}_part${partNumber}`,
                    chunk,
                    {
                        level: 'protected',
                        contentType: 'application/octet-stream',
                        progressCallback: (progress) => {
                            if (this.aborted) return;
                            const partProgress = (progress.loaded / chunk.size) * 100;
                            this.updatePartProgress(partNumber, partProgress, 'uploading');
                        }
                    }
                );

                this.updatePartProgress(partNumber, 100, 'completed');
                this.activeUploads.delete(partNumber);

                return {
                    PartNumber: partNumber,
                    ETag: response.key
                };

            } catch (error) {
                this.activeUploads.delete(partNumber);
                retries++;

                if (retries >= maxRetries) {
                    this.updatePartProgress(partNumber, 0, 'error', error.message);
                    throw new Error(`Failed to upload part ${partNumber} after ${maxRetries} attempts: ${error.message}`);
                }

                const delay = Math.min(initialDelay * Math.pow(2, retries - 1), this.maxRetryDelay)
                    + Math.random() * 1000;

                this.updatePartProgress(
                    partNumber, 
                    0, 
                    'retrying', 
                    `Retrying... (Attempt ${retries} of ${maxRetries})`
                );

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async completeUpload() {
        try {
            if (!this.aborted && this.uploadedParts?.length) {
                // Ensure parts are in order
                const orderedParts = this.uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);
    
                try {
                    // Complete the multipart upload
                    const finalResponse = await Storage.put(
                        this.path,
                        this.file,
                        {
                            level: 'protected',
                            contentType: this.file.type,
                            progressCallback: (progress) => {
                                const finalProgress = this.calculateProgress(this.numParts, progress.loaded);
                                this.onProgress?.(finalProgress);
                                this.stateManager.notifyProgress(this.uploadId, finalProgress);
                            }
                        }
                    );
    
                    // Update final progress and state
                    const finalProgress = this.calculateProgress(this.numParts, this.file.size);
                    finalProgress.status = 'completed';
                    
                    this.stateManager.saveUploadState(this.uploadId, {
                        ...this.stateManager.getUploadState(this.uploadId),
                        ...finalProgress,
                        completed: true,
                        completedAt: Date.now(),
                        key: finalResponse.key // Store the final S3 key
                    });
    
                    // Clean up any temporary part files if needed
                    await this.cleanupParts();
    
                } catch (error) {
                    console.error('Failed to complete multipart upload:', error);
                    throw error;
                }
            }
        } catch (error) {
            console.error('Failed to complete upload:', error);
            throw error;
        } finally {
            this.stateManager.unregisterUpload(this.uploadId);
        }
    }
    
    // Add this method to handle cleanup of temporary parts if needed
    async cleanupParts() {
        try {
            for (const part of this.uploadedParts) {
                try {
                    // If you're storing temporary part files, clean them up here
                    const partKey = `${this.path}_part${part.PartNumber}`;
                    await Storage.remove(partKey, { level: 'protected' });
                } catch (cleanupError) {
                    console.warn(`Failed to cleanup part ${part.PartNumber}:`, cleanupError);
                    // Continue with cleanup even if one part fails
                }
            }
        } catch (error) {
            console.warn('Error during parts cleanup:', error);
            // Don't throw the error as the main upload was successful
        }
    }    

    async abort() {
        this.aborted = true;
        try {
            if (this.s3UploadId) {
                await Storage.cancel(this.path, { id: this.s3UploadId });
            }
            this.activeUploads.clear();
            this.stateManager.removeUploadState(this.uploadId);
        } catch (error) {
            console.error('Error aborting upload:', error);
        }
    }

    async handleError(error) {
        console.error('Upload error:', error);
        const errorState = {
            ...this.stateManager.getUploadState(this.uploadId),
            failed: true,
            error: error.message,
            failedAt: Date.now(),
            status: 'error'
        };
        this.stateManager.saveUploadState(this.uploadId, errorState);
        throw error;
    }

    updateProgress(completedParts) {
        if (!this.aborted) {
            const progressInfo = this.calculateProgress(completedParts, this.bytesUploaded);
            this.onProgress?.(progressInfo);
            this.stateManager.notifyProgress(this.uploadId, progressInfo);
        }
    }

    logProgress(progressInfo) {
        console.log(`
            Upload Progress for ${progressInfo.filename}:
            - Progress: ${progressInfo.progress.toFixed(2)}%
            - Parts: ${progressInfo.loadedParts}/${progressInfo.totalParts}
            - Uploaded: ${formatBytes(progressInfo.bytesUploaded)}/${formatBytes(progressInfo.totalSize)}
            - Speed: ${progressInfo.uploadSpeed}
            - Average Speed: ${progressInfo.averageSpeed}
            - ETA: ${progressInfo.estimatedTimeRemaining}
            - Elapsed Time: ${progressInfo.elapsedTime}
            - Status: ${progressInfo.status}
            - Part Statistics: 
                Completed: ${progressInfo.statistics.completed}
                In Progress: ${progressInfo.statistics.inProgress}
                Failed: ${progressInfo.statistics.failed}
                Pending: ${progressInfo.statistics.pending}
        `);
    }

    async retry() {
        if (this.aborted) return false;
        
        const failedParts = this.parts.filter(part => part.error);
        for (const part of failedParts) {
            if (this.aborted) break;
            
            const start = (part.partNumber - 1) * UPLOAD_CONFIG.CHUNK_SIZE;
            const end = Math.min(start + UPLOAD_CONFIG.CHUNK_SIZE, this.file.size);
            const chunk = this.file.slice(start, end);
            
            try {
                await this.uploadPart(chunk, part.partNumber);
            } catch (error) {
                console.error(`Failed to retry part ${part.partNumber}:`, error);
                throw error;
            }
        }
        
        return !this.aborted;
    }

    async retryPart(partNumber) {
        const part = this.parts[partNumber - 1];
        if (!part) {
            throw new Error(`Invalid part number: ${partNumber}`);
        }
    
        const chunk = this.file.slice(part.startByte, part.endByte);
        console.log(`Retrying upload for part ${partNumber}`);
    
        try {
            const result = await this.uploadPart(chunk, partNumber);
            this.updatePartProgress(partNumber, 100, 'completed');
            return result;
        } catch (error) {
            console.error(`Retry failed for part ${partNumber}:`, error);
            throw error;
        }
    }

    async retryFailedParts() {
        const failedParts = this.parts.filter(part => 
            part.status === 'error' || part.status === 'retrying'
        );
    
        if (failedParts.length === 0) {
            console.log('No failed parts to retry');
            return true;
        }
    
        console.log(`Retrying ${failedParts.length} failed parts`);
        
        const retryPromises = failedParts.map(part => 
            this.retryPart(part.partNumber)
        );
    
        try {
            await Promise.all(retryPromises);
            return true;
        } catch (error) {
            console.error('Failed to retry all failed parts:', error);
            throw error;
        }
    }    
    
}

// Export the MultipartUploadHandler class
export { MultipartUploadHandler };
/**
 * Progress Monitoring Components
 */

const UploadProgress = ({ historyList }) => {
    const [retrying, setRetrying] = useState({});
    const uploadStateManager = useContext(UploadStateContext);

    const handleRetryAllFailedParts = async (item) => {
        try {
            setRetrying(prev => ({ ...prev, [item.id]: true }));
            
            // Find the upload handler for this file
            const handler = uploadStateManager.getActiveUploads().find(h => h.uploadId === item.id);
            if (!handler) {
                throw new Error('Upload handler not found');
            }

            // Retry all failed parts
            await handler.retryFailedParts();
            
            // Refresh the upload status
            await handler.updateOverallProgress();

        } catch (error) {
            console.error('Failed to retry parts:', error);
            // Show error alert
            setAlertMessage(`Failed to retry upload parts: ${error.message}`);
            setVisibleAlert(true);
        } finally {
            setRetrying(prev => ({ ...prev, [item.id]: false }));
        }
    };

    return (
        <Container
            header={
                <Header variant="h2">
                    Active Uploads & Progress
                </Header>
            }
        >
            {historyList.map((item) => (
                <SpaceBetween size="m" key={item.id}>
                    <Container
                        header={
                            <Header variant="h3">
                                {item.filename}
                            </Header>
                        }
                    >
                        <SpaceBetween size="s">
                            {/* Warning Message */}
                            {item.status === 'in-progress' && (
                                <Alert
                                    type="warning"
                                    statusIconAriaLabel="Warning"
                                    header="Upload in progress"
                                >
                                    <span style={{ color: '#d13212' }}>
                                        Please do not close this tab or navigate away until the upload is complete.
                                    </span>
                                </Alert>
                            )}

                            {/* Main Progress Bar */}
                            <ProgressBar
                                status={item.status}
                                value={item.percentage}
                                variant="standalone"
                                label="Upload Progress"
                                additionalInfo={`${item.percentage ? item.percentage.toFixed(1) : 0}%`}
                            />

                            {/* Basic Statistics */}
                            <ColumnLayout columns={2} variant="text-grid">
                                <div>
                                    <Box variant="awsui-key-label">File Size</Box>
                                    <div>{item.filesize}</div>
                                </div>
                                <div>
                                    <Box variant="awsui-key-label">Upload Speed</Box>
                                    <div>{item.uploadSpeed || 'Calculating...'}</div>
                                </div>
                                <div>
                                    <Box variant="awsui-key-label">Time Remaining</Box>
                                    <div>{item.estimatedTimeRemaining || 'Calculating...'}</div>
                                </div>
                                <div>
                                    <Box variant="awsui-key-label">Elapsed Time</Box>
                                    <div>{item.elapsedTime || '0s'}</div>
                                </div>
                            </ColumnLayout>

                            {/* Failed Parts Alert and Retry Option */}
                            {item.statistics?.failed > 0 && (
                                <Alert
                                    type="error"
                                    header={`Upload Partially Failed - ${item.statistics.failed} parts failed`}
                                    action={
                                        <Button
                                            onClick={() => handleRetryAllFailedParts(item)}
                                            loading={retrying[item.id]}
                                            disabled={retrying[item.id]}
                                        >
                                            {retrying[item.id] ? 'Retrying...' : 'Retry Failed Parts'}
                                        </Button>
                                    }
                                >
                                    Some parts of the file failed to upload. You can retry the failed parts.
                                    <Box variant="small" color="text-body-secondary">
                                        Completed: {item.statistics.completed} parts
                                        <br />
                                        Failed: {item.statistics.failed} parts
                                    </Box>
                                </Alert>
                            )}

                            {/* General Error Display */}
                            {item.error && !item.statistics?.failed && (
                                <Alert type="error" header="Upload Error">
                                    {item.error}
                                </Alert>
                            )}
                        </SpaceBetween>
                    </Container>
                </SpaceBetween>
            ))}
        </Container>
    );
};


const UploadMonitor = ({ uploadId }) => {
    const [progress, setProgress] = useState(null);
    const uploadStateManager = useContext(UploadStateContext);

    useEffect(() => {
        const updateProgress = () => {
            const state = uploadStateManager.getUploadState(uploadId);
            if (state) {
                setProgress(state);
            }
        };

        // Initial update
        updateProgress();

        // Set up interval for updates
        const interval = setInterval(updateProgress, UPLOAD_CONFIG.PROGRESS_UPDATE_INTERVAL);

        // Listen for progress events
        const handleProgress = (event) => {
            if (event.detail.uploadId === uploadId) {
                setProgress(event.detail.progress);
            }
        };

        window.addEventListener('upload-progress', handleProgress);

        return () => {
            clearInterval(interval);
            window.removeEventListener('upload-progress', handleProgress);
        };
    }, [uploadId, uploadStateManager]);

    if (!progress) return null;

    return (
        <Box padding="s">
            <SpaceBetween size="s">
                <ProgressBar
                    value={progress.percentage}
                    status={progress.status}
                    label={progress.path}
                    additionalInfo={
                        <>
                            {formatBytes(progress.bytesUploaded)} of {formatBytes(progress.totalSize)} | 
                            Speed: {progress.uploadSpeed}
                        </>
                    }
                />
                <Box variant="small">
                    <SpaceBetween size="s">
                        <div>Parts uploaded: {progress.loadedParts}/{progress.totalParts}</div>
                        <div>Estimated time remaining: {progress.estimatedTimeRemaining}</div>
                        <div>Average speed: {progress.averageSpeed}</div>
                    </SpaceBetween>
                    {progress.error && (
                        <Alert type="error">
                            {progress.error}
                            <Button onClick={() => retryUpload(uploadId)}>Retry</Button>
                        </Alert>
                    )}
                </Box>
            </SpaceBetween>
        </Box>
    );
};

/**
 * Service Navigation Component
 */
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
            header={null}
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
};
/**
 * Content Component
 */
const Content = () => {
    const fileInput = useRef(null);
    const folderInput = useRef(null);
    const [visibleAlert, setVisibleAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [uploadList, setUploadList] = useState([]);
    const [fileList, setFileList] = useState([]);
    const [historyList, setHistoryList] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [bucketContents, setBucketContents] = useState(null);
    const [bucketName, setBucketName] = useState('');
    const [viewingBucket, setViewingBucket] = useState(false);
    const [uploadStateManager] = useState(() => new UploadStateManager());
    const [isUploading, setIsUploading] = useState(false);
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // handleDelete function
    const handleDelete = async () => {
        try {
            if (itemToDelete) {
                if (itemToDelete.isFolder) {
                    // Delete folder and its contents
                    const folderPath = itemToDelete.key;
                    console.log('Deleting folder:', folderPath);

                    // List all contents including hidden files
                    const folderContents = await Storage.list(folderPath + '/', { 
                        level: 'protected',
                        pageSize: 1000
                    });

                    // Delete all items in the folder
                    for (const item of folderContents.results) {
                        console.log('Deleting item:', item.key);
                        await Storage.remove(item.key, { level: 'protected' });
                    }

                    // Delete the folder marker itself
                    await Storage.remove(folderPath + '/', { level: 'protected' });

                    console.log('Folder deletion completed');
                } else {
                    // Delete single file
                    console.log('Deleting file:', itemToDelete.key);
                    await Storage.remove(itemToDelete.key, { level: 'protected' });
                }

                // Wait longer for S3 consistency
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Refresh the list
                await listBucketContents(currentPath);
                setShowDeleteConfirmation(false);
            }
        } catch (error) {
            console.error('Error deleting:', error);
            setAlertMessage(`Error deleting ${itemToDelete?.key}: ${error.message}`);
            setVisibleAlert(true);
            await listBucketContents(currentPath);
        } finally {
            setItemToDelete(null);
        }
    };

    // Effect for initialization and cleanup
    useEffect(() => {
        const initializeBucket = async () => {
            try {
                console.log('Initializing bucket view');
                const bucket = awsconfig.aws_user_files_s3_bucket;
                setBucketName(bucket || 'Bucket name not found');
                
                // Configure Storage
                Storage.configure({
                    AWSS3: {
                        bucket: bucket,
                        region: awsconfig.aws_user_files_s3_bucket_region,
                        level: 'protected'
                    }
                });

                // Initialize upload state manager
                uploadStateManager.init();

                // If viewing bucket, list contents
                if (viewingBucket) {
                    await listBucketContents(currentPath);
                }
            } catch (error) {
                console.error('Error initializing:', error);
                setAlertMessage(`Error initializing: ${error.message}`);
                setVisibleAlert(true);
            }
        };

        const handleUploadProgress = (event) => {
            if (event.detail.type === 'upload-progress') {
                setHistoryList(prevList => {
                    const newList = [...prevList];
                    const index = newList.findIndex(item => item.id === event.detail.uploadId);
                    if (index !== -1) {
                        newList[index] = {
                            ...newList[index],
                            ...event.detail.progress
                        };
                    } else {
                        newList.push(event.detail.progress);
                    }
                    return newList;
                });
            }
        };

        window.addEventListener('upload-progress', handleUploadProgress);
        initializeBucket();

        return () => {
            window.removeEventListener('upload-progress', handleUploadProgress);
            uploadStateManager.cleanup();
        };
    }, [viewingBucket]);

    const createNewFolder = async () => {
        const folderName = prompt('Enter folder name:');
        if (!folderName) return;

        const cleanFolderName = folderName.trim().replace(/^\/+|\/+$/g, '');
        
        if (cleanFolderName) {
            try {
                const folderPath = currentPath
                    ? `${currentPath}/${cleanFolderName}/`  // Add trailing slash
                    : `${cleanFolderName}/`;  // Add trailing slash
                
                console.log('Creating folder at path:', folderPath);
                
                // Upload an empty file in the folder to create it
                await Storage.put(
                    `${folderPath}.keep`,
                    new Blob([''], { type: 'text/plain' }), 
                    {
                        level: 'protected',
                        contentType: 'text/plain'
                    }
                );
                
                // Also create an empty folder marker
                await Storage.put(
                    folderPath,
                    new Blob([''], { type: 'application/x-directory' }), 
                    {
                        level: 'protected',
                        contentType: 'application/x-directory'
                    }
                );
                
                // Check if folder already exists
                const existingCheck = await Storage.list(`${folderPath}/`, {
                    level: 'protected',
                    pageSize: 1
                });

                if (existingCheck.results && existingCheck.results.length > 0) {
                    setAlertMessage('Folder already exists');
                    setVisibleAlert(true);
                    return;
                }
                
                console.log('Folder created, waiting for consistency...');

                // Add small delay before refreshing to ensure S3 consistency
                await new Promise(resolve => setTimeout(resolve, 1000));
                await listBucketContents(currentPath);
                
            } catch (error) {
                console.error('Error creating folder:', error);
                setAlertMessage(`Error creating folder: ${error.message}`);
                setVisibleAlert(true);
            }
        }
    };

    const listBucketContents = async (path = '') => {
        try {
            console.log('Listing contents for path:', path);
            setBucketContents(null); // Show loading state

            const result = await Storage.list(path || '', { 
                level: 'protected',
                pageSize: 1000
            });
            
            console.log('Raw S3 response:', result);

            if (!result || !result.results) {
                console.log('No results found');
                setBucketContents([]);
                return;
            }

            const items = result.results;
            const processedItems = new Map();
            
            // First pass: Identify all folders
            items.forEach(item => {
                if (!item.key) return;
            
                // Skip the current directory marker
                if (item.key === path ||
                    item.key.includes('.keep') ||
                    item.key.endsWith('/.keep')) return;
    
                const relativePath = path ? item.key.replace(`${path}/`, '') : item.key;
                const parts = relativePath.split('/');
    
                // Handle folder markers
                if (item.key.endsWith('/') || 
                    item.contentType === 'application/x-directory' || 
                    item.size === 0) {
                    const folderName = parts[0];
                    // Skip if folder name contains .keep
                    if (folderName && 
                        !folderName.includes('.keep') && 
                        !processedItems.has(folderName)) {
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

            // Second pass: Add files and identify implicit folders
            items.forEach(item => {
                if (!item.key) return;
                
                // Skip folder markers and .keep files
                if (item.key === path || 
                    item.key.endsWith('/') || 
                    item.key.endsWith('/.keep') || 
                    item.contentType === 'application/x-directory') return;
    
                const relativePath = path ? item.key.replace(`${path}/`, '') : item.key;
                const parts = relativePath.split('/');
    
                if (parts.length === 1) {
                    // File in current directory
                    processedItems.set(parts[0], {
                        key: item.key,
                        displayName: parts[0],
                        size: item.size,
                        isFolder: false,
                        lastModified: item.lastModified
                    });
                } else if (parts.length > 1) {
                    // Implicit folder
                    const folderName = parts[0];
                    if (!folderName.includes('.keep') && !processedItems.has(folderName)) {
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
                .filter(item => !item.displayName.includes('.keep')) // Extra safety filter
                .sort((a, b) => {
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;
                    return a.displayName.localeCompare(b.displayName);
                });
    
            console.log('Processed contents:', contents);
            setBucketContents(contents);
    
        } catch (error) {
            console.error('Error listing bucket contents:', error);
            setAlertMessage(`Error listing contents: ${error.message}`);
            setVisibleAlert(true);
            setBucketContents([]);
        }
    };
    
    const handleFileSelect = (e, isFolder = false) => {
        e.preventDefault();
        let tempUploadList = [];
        
        const files = e.target.files;
        for (let i = 0; i < files.length; i++) {
            if (files[i].size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
                setAlertMessage(`File ${files[i].name} is larger than 5TB`);
                setVisibleAlert(true);
                return;
            }
            
            const path = isFolder ? files[i].webkitRelativePath : files[i].name;
            tempUploadList.push({
                label: path,
                labelTag: formatBytes(files[i].size),
                description: 'File type: ' + files[i].type,
                icon: 'file',
                id: `upload-${Date.now()}-${i}`,
                path: path
            });
        }
        
        setUploadList(tempUploadList);
        setFileList(Array.from(files));
    };

    const handleUpload = async () => {
        if (uploadList.length === 0) {
            setAlertMessage('No files selected');
            setVisibleAlert(true);
            return;
        }
    
        setIsUploading(true);
        try {
            for (let i = 0; i < uploadList.length; i++) {
                const file = fileList[i];
                const path = currentPath 
                    ? `${currentPath}/${uploadList[i].path}`
                    : uploadList[i].path;
    
                console.log('Starting upload for:', path);
    
                const uploadId = `upload-${Date.now()}-${i}`;
                const startTime = Date.now();
                let lastValidSpeed = 0;
                let totalBytesUploaded = 0;
    
                const speedCalculator = {
                    windowSize: 5, // Number of seconds to average over
                    measurements: [],
                    
                    addMeasurement(bytesUploaded, timestamp) {
                        this.measurements.push({ bytesUploaded, timestamp });
                        
                        // Remove measurements older than windowSize seconds
                        const cutoff = timestamp - (this.windowSize * 1000);
                        this.measurements = this.measurements.filter(m => m.timestamp > cutoff);
                    },
    
                    getCurrentSpeed() {
                        if (this.measurements.length < 2) return 0;
                        const oldest = this.measurements[0];
                        const newest = this.measurements[this.measurements.length - 1];
                        const timeDiff = (newest.timestamp - oldest.timestamp) / 1000; // seconds
                        const bytesDiff = newest.bytesUploaded - oldest.bytesUploaded;
                        return timeDiff > 0 ? bytesDiff / timeDiff : 0;
                    }
                };
    
                // Initialize the upload in history list
                setHistoryList(prevList => {
                    const existingIndex = prevList.findIndex(item => 
                        item.filename === file.name && item.status === 'in-progress'
                    );
                    
                    if (existingIndex !== -1) return prevList;
    
                    return [...prevList, {
                        id: uploadId,
                        filename: file.name,
                        filetype: file.type,
                        filesize: formatBytes(file.size),
                        totalSize: file.size,
                        percentage: 0,
                        status: 'in-progress',
                        uploadSpeed: 'Calculating...',
                        estimatedTimeRemaining: 'Calculating...',
                        elapsedTime: '0s',
                        bytesUploaded: 0
                    }];
                });
    
                try {
                    await Storage.put(path, file, {
                        level: 'protected',
                        contentType: file.type,
                        progressCallback: (progress) => {
                            const now = Date.now();
                            const elapsedTime = (now - startTime) / 1000; // seconds
                            const percentage = (progress.loaded / progress.total) * 100;
    
                            speedCalculator.addMeasurement(progress.loaded, now);
                            const currentSpeed = speedCalculator.getCurrentSpeed();
                            const speedInMbps = (currentSpeed * 8) / (1000 * 1000); // Convert to Mbps
    
                            if (Number.isFinite(speedInMbps) && speedInMbps > 0) {
                                lastValidSpeed = speedInMbps;
                            }
    
                            const displaySpeed = Number.isFinite(speedInMbps) && speedInMbps > 0 
                                ? speedInMbps 
                                : lastValidSpeed;
    
                            // Calculate estimated time remaining
                            const remainingBytes = progress.total - progress.loaded;
                            const estimatedTimeRemaining = displaySpeed > 0 
                                ? (remainingBytes * 8) / (displaySpeed * 1000 * 1000) 
                                : 0;
    
                            totalBytesUploaded = progress.loaded;
    
                            setHistoryList(prevList => {
                                const newList = [...prevList];
                                const index = newList.findIndex(item => item.id === uploadId);
                                if (index !== -1) {
                                    newList[index] = {
                                        ...newList[index],
                                        percentage,
                                        status: 'in-progress',
                                        uploadSpeed: formatSpeed(displaySpeed),
                                        estimatedTimeRemaining: formatTime(estimatedTimeRemaining),
                                        elapsedTime: formatTime(elapsedTime),
                                        bytesUploaded: totalBytesUploaded,
                                    };
                                }
                                return newList;
                            });
                        }
                    });
    
                    // Calculate final statistics
                    const finalElapsedTime = (Date.now() - startTime) / 1000;
                    const averageSpeed = (file.size / finalElapsedTime) * 8 / (1000 * 1000); // Mbps
    
                    setHistoryList(prevList => {
                        const newList = [...prevList];
                        const index = newList.findIndex(item => item.id === uploadId);
                        if (index !== -1) {
                            newList[index] = {
                                ...newList[index],
                                percentage: 100,
                                status: 'success',
                                uploadSpeed: `Complete (Avg: ${formatSpeed(averageSpeed)})`,
                                estimatedTimeRemaining: '0s',
                                elapsedTime: formatTime(finalElapsedTime),
                                bytesUploaded: file.size,
                            };
                        }
                        return newList;
                    });
    
                } catch (error) {
                    console.error('Upload failed:', error);
                    setHistoryList(prevList => {
                        const newList = [...prevList];
                        const index = newList.findIndex(item => item.id === uploadId);
                        if (index !== -1) {
                            newList[index] = {
                                ...newList[index],
                                status: 'error',
                                uploadSpeed: 'Failed',
                                error: error.message
                            };
                        }
                        return newList;
                    });
    
                    setAlertMessage(`Error uploading ${file.name}: ${error.message}`);
                    setVisibleAlert(true);
                }
            }
    
            // Clear upload list and refresh contents
            setUploadList([]);
            setFileList([]);
            
            // Wait for S3 consistency
            await new Promise(resolve => setTimeout(resolve, 2000));
            await listBucketContents(currentPath);
    
        } finally {
            setIsUploading(false);
        }
    };
    
    // Helper function to format speed in Mbps
    const formatSpeed = (speedInMbps) => {
        if (!Number.isFinite(speedInMbps) || speedInMbps <= 0) {
            return 'Calculating...';
        }
        
        try {
            if (speedInMbps >= 1000) {
                return `${(speedInMbps / 1000).toFixed(2)} Gbps`;
            } else {
                return `${speedInMbps.toFixed(2)} Mbps`;
            }
        } catch (error) {
            console.error('Error formatting speed:', error);
            return 'Calculating...';
        }
    };
    
    // Helper function to format time
    const formatTime = (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating...';
        if (seconds === 0) return '0s';
        
        seconds = Math.round(seconds);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
    
        let timeString = '';
        if (hours > 0) timeString += `${hours}h `;
        if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
        if (remainingSeconds > 0 || (hours === 0 && minutes === 0)) timeString += `${remainingSeconds}s`;
    
        return timeString.trim();
    };

    // Helper function to format bytes (if you don't already have one)
    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    const handleDismiss = (itemIndex) => {
        setUploadList([
            ...uploadList.slice(0, itemIndex),
            ...uploadList.slice(itemIndex + 1)
        ]);
        setFileList([
            ...fileList.slice(0, itemIndex),
            ...fileList.slice(itemIndex + 1)
        ]);
    };

    return (
        <UploadStateContext.Provider value={uploadStateManager}>
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
                                                onFollow={async () => {
                                                    try {
                                                        console.log('Entering bucket view');
                                                        setViewingBucket(true);
                                                        setCurrentPath('');
                                                        await new Promise(resolve => setTimeout(resolve, 0));
                                                        await listBucketContents('');
                                                    } catch (error) {
                                                        console.error('Error navigating to bucket:', error);
                                                        setAlertMessage(`Error accessing bucket: ${error.message}`);
                                                        setVisibleAlert(true);
                                                    }
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
                        <SpaceBetween size="l">
                            <Container
                                header={
                                    <Header
                                        variant="h2"
                                        actions={
                                            <SpaceBetween direction="horizontal" size="xs">
                                                {currentPath && (
                                                    <Button
                                                        onClick={() => {
                                                            const parentPath = currentPath.split('/').slice(0, -1).join('/');
                                                            setCurrentPath(parentPath);
                                                            listBucketContents(parentPath);
                                                        }}
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
                                                    disabled={isUploading}
                                                >
                                                    Add Files
                                                </Button>
                                                <Button
                                                    onClick={() => folderInput.current.click()}
                                                    iconName="folder"
                                                    disabled={isUploading}
                                                >
                                                    Add Folder
                                                </Button>
                                            </SpaceBetween>
                                        }
                                    >
                                        <BreadcrumbGroup
                                            items={[
                                                { 
                                                    text: bucketName, 
                                                    href: '#', 
                                                    onClick: (e) => {
                                                        e.preventDefault();
                                                        setCurrentPath('');
                                                        listBucketContents('');
                                                    }
                                                },
                                                ...(currentPath ? currentPath.split('/').map((part, index, array) => ({
                                                    text: part,
                                                    href: '#',
                                                    onClick: (e) => {
                                                        e.preventDefault();
                                                        const newPath = array.slice(0, index + 1).join('/');
                                                        setCurrentPath(newPath);
                                                        listBucketContents(newPath);
                                                    }
                                                })) : [])
                                            ]}
                                        />
                                    </Header>
                                }
                            >
                                                                {bucketContents === null ? (
                                    <Box textAlign="center" padding="l">
                                        <Spinner size="large" />
                                        <Box variant="p">Loading bucket contents...</Box>
                                    </Box>
                                ) : (
                                    <SpaceBetween size="l">
                                        <Table
                                            items={bucketContents}
                                            loadingText="Loading bucket contents..."
                                            columnDefinitions={[
                                                {
                                                    id: 'name',
                                                    header: 'Name',
                                                    cell: item => (
                                                        <Link
                                                            onFollow={() => {
                                                                if (item.isFolder) {
                                                                    const normalizedKey = item.key.replace(/\/\.keep$|\/$/, '');
                                                                    setCurrentPath(normalizedKey);
                                                                    listBucketContents(normalizedKey);
                                                                } else {
                                                                    Storage.get(item.key, { level: 'protected' })
                                                                        .then(url => window.open(url, '_blank'))
                                                                        .catch(error => {
                                                                            console.error('Error downloading file:', error);
                                                                            setAlertMessage(`Error downloading file: ${error.message}`);
                                                                            setVisibleAlert(true);
                                                                        });
                                                                }
                                                            }}
                                                        >
                                                            {item.isFolder ? '📁 ' : '📄 '}
                                                            {item.displayName}
                                                        </Link>
                                                    )
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
                                                        <SpaceBetween direction="horizontal" size="xs">
                                                            {!item.isFolder && (
                                                                <Button
                                                                    onClick={() => {
                                                                        Storage.get(item.key, { level: 'protected' })
                                                                            .then(url => window.open(url, '_blank'))
                                                                            .catch(error => {
                                                                                setAlertMessage(`Error downloading file: ${error.message}`);
                                                                                setVisibleAlert(true);
                                                                            });
                                                                    }}
                                                                    iconName="download"
                                                                >
                                                                    Download
                                                                </Button>
                                                            )}
                                                            <Button
                                                                onClick={() => {
                                                                    setItemToDelete(item);
                                                                    setShowDeleteConfirmation(true);
                                                                }}
                                                                variant="link"
                                                            >
                                                                Delete
                                                            </Button>
                                                        </SpaceBetween>
                                                    )
                                                }
                                            ]}
                                            empty={
                                                <Box textAlign="center" color="inherit">
                                                    <b>No files</b>
                                                    <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                                                        This folder is empty
                                                    </Box>
                                                </Box>
                                            }
                                        />

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

                                        {uploadList.length > 0 && (
                                            <SpaceBetween size="s">
                                                <TokenGroup
                                                    onDismiss={({detail: {itemIndex}}) => handleDismiss(itemIndex)}
                                                    items={uploadList}
                                                    alignment="vertical"
                                                    limit={10}
                                                />
                                                <Button 
                                                    variant="primary" 
                                                    onClick={handleUpload}
                                                    disabled={isUploading}
                                                >
                                                    {isUploading ? 'Uploading...' : 'Upload Selected'}
                                                </Button>
                                            </SpaceBetween>
                                        )}

                                        <UploadProgress historyList={historyList} />
                                    </SpaceBetween>
                                )}
                            </Container>

                            {showDeleteConfirmation && (
                                <Modal
                                    visible={showDeleteConfirmation}
                                    onDismiss={() => {
                                        setShowDeleteConfirmation(false);
                                        setItemToDelete(null);
                                    }}
                                    header="Delete Confirmation"
                                    closeAriaLabel="Close dialog"
                                    footer={
                                        <Box float="right">
                                            <SpaceBetween direction="horizontal" size="xs">
                                                <Button
                                                    variant="link"
                                                    onClick={() => {
                                                        setShowDeleteConfirmation(false);
                                                        setItemToDelete(null);
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    variant="primary"
                                                    onClick={handleDelete}  // Change this line                                                    
                                                >
                                                    Delete
                                                </Button>
                                            </SpaceBetween>
                                        </Box>
                                    }
                                >
                                    <Box>
                                        Are you sure you want to delete{' '}
                                        <strong>{itemToDelete?.displayName}</strong>?
                                        {itemToDelete?.isFolder && (
                                            <p>This will delete all contents within this folder.</p>
                                        )}
                                    </Box>
                                </Modal>
                            )}
                        </SpaceBetween>
                    )}
                </SpaceBetween>
            </ContentLayout>
        </UploadStateContext.Provider>
    );
};

// Export ContentWithErrorBoundary instead of just Content
export const ContentWithErrorBoundary = () => {
    return (
        <ErrorBoundary>
            <Content />
        </ErrorBoundary>
    );
}
/**
 * Main App Component
 */
function App() {
    const [navigationOpen, setNavigationOpen] = useState(false);
    const [uploadStateManager] = useState(new UploadStateManager());

    const navbarItemClick = e => {
        if (e.detail.id === 'signout') {
            Auth.signOut().then(() => {
                window.location.reload();
            });
        }
    };

    return (
        <Authenticator>
            {({signOut, user}) => (
                <UploadStateContext.Provider value={uploadStateManager}>
                    <div id="navbar" style={{
                        fontSize: 'body-l !important', 
                        position: 'sticky', 
                        top: 0, 
                        zIndex: 1002
                    }}>
                        <TopNavigation
                            identity={{
                                href: "#",
                                title: "S3 Object Upload Tool",
                                logo: {
                                    src: "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAxNC4wLjAsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDQzMzYzKSAgLS0+DQo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPg0KPHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgd2lkdGg9IjcwcHgiIGhlaWdodD0iNzBweCIgdmlld0JveD0iMCAwIDcwIDcwIiBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCA3MCA3MCIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8Zz4NCgk8Zz4NCgkJPGc+DQoJCQk8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZmlsbD0iIzE0NkVCNCIgZD0iTTYzLjk1LDE1Ljc4NmMwLDQuMDA2LTEyLjk2Myw3LjIzOC0yOC45NDksNy4yMzgNCgkJCQljLTE1Ljk4OCwwLTI4Ljk1MS0zLjIzMi0yOC45NTEtNy4yMzhsOS42NSw0My44MzljMCwyLjY3Miw4LjYzNyw0LjgyNiwxOS4zMDEsNC44MjZjMTAuNjYyLDAsMTkuMjk5LTIuMTU0LDE5LjI5OS00LjgyNmw5LjY1LTQzLjgzOXoiLz4NCgkJPC9nPg0KCTwvZz4NCgk8Zz4NCgkJPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiMxNDZFQjQiIGQ9Ik02My45NSwxMi43ODZjMC00LjAwNC0xMi45NjMtNy4yMzctMjguOTQ5LTcuMjM3DQoJCQljLTE1Ljk4OCwwLTI4Ljk1MSwzLjIzMy0yOC45NTEsNy4yMzdjMCw0LjAwNiwxMi45NjMsNy4yMzgsMjguOTUxLDcuMjM4QzUwLjk4NywyMC4wMjQsNjMuOTUsMTYuNzkyLDYzLjk1LDEyLjc4NnoiLz4NCgk8L2c+DQo8L2c+DQo8L3N2Zz4NCg==",
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
                        content={<ContentWithErrorBoundary />}
                        headerSelector='#navbar'
                        navigation={<ServiceNavigation/>}
                        navigationOpen={navigationOpen}
                        onNavigationChange={({detail}) => setNavigationOpen(detail.open)}
                        ariaLabels={appLayoutLabels}
                    />
                </UploadStateContext.Provider>
            )}
        </Authenticator>
    );
}

// Only default export for App
export default App;
