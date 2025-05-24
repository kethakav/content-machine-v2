// Recieve the POST request with the preset, theme details, and clipconfig
// Create a VideoProcessor instance with those settings
// Download the media to fs
// Create video
// Delete source videos
// Send the video URL as the response

// Media storage :- Store the media until the client downloads the video, then delete the video

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import VideoProcessor from './src/helpers/videoProcessor.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Configure multer for handling file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Create media/yt-downloads directory if it doesn't exist
const ytDownloadsDir = path.join(__dirname, 'media', 'yt-downloads');
if (!fs.existsSync(ytDownloadsDir)) {
    fs.mkdirSync(ytDownloadsDir, { recursive: true });
}

// Function to check if a string is a YouTube URL
const isYoutubeUrl = (url) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    return youtubeRegex.test(url);
};

// Function to extract YouTube video ID
const extractYoutubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// Function to download YouTube video
const downloadYoutubeVideo = async (url) => {
    const videoId = extractYoutubeId(url);
    if (!videoId) {
        throw new Error('Invalid YouTube URL');
    }

    const outputPath = path.join(ytDownloadsDir, `${videoId}.mp4`);
    
    // Check if video already exists
    if (fs.existsSync(outputPath)) {
        console.log(`Using cached video for ID: ${videoId}`);
        return outputPath;
    }
    
    try {
        const command = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --cookies "C:\\Users\\User\\youtube_cookies.txt" -o "${outputPath}" "${url}"`;
        await execAsync(command);
        return outputPath;
    } catch (error) {
        console.error('Error downloading YouTube video:', error);
        throw new Error(`Failed to download YouTube video: ${error.message}`);
    }
};

// Validate request body
const validateRequest = (req) => {
    const { theme, preset, clipConfig, imageConfig, audioConfig } = req.body;

    console.log(req.body);
    
    if (!theme || typeof theme !== 'object') {
        throw new Error('Invalid theme configuration');
    }
    
    if (!preset || typeof preset !== 'string') {
        throw new Error('Invalid preset configuration');
    }
    
    if (!clipConfig || !Array.isArray(clipConfig)) {
        throw new Error('Invalid clip configuration');
    }
    
    // Validate each clip config
    clipConfig.forEach((clip, index) => {
        if (!clip.videoPath && !clip.imagePath) {
            throw new Error(`Clip ${index} must have either videoPath or imagePath`);
        }
        if (clip.startTime === undefined || clip.endTime === undefined) {
            throw new Error(`Clip ${index} must have startTime and endTime`);
        }
    });

    // Validate imageConfig if present
    if (imageConfig) {
        if (!Array.isArray(imageConfig)) {
            throw new Error('imageConfig must be an array');
        }
        
        imageConfig.forEach((config, index) => {
            if (!config.imagePath) {
                throw new Error(`imageConfig[${index}] must have imagePath`);
            }
            if (config.startTime === undefined || config.endTime === undefined) {
                throw new Error(`imageConfig[${index}] must have startTime and endTime`);
            }
            if (config.x === undefined || config.y === undefined) {
                throw new Error(`imageConfig[${index}] must have x and y coordinates`);
            }
        });
    }

    // Validate audioConfig if present
    if (audioConfig) {
        if (!Array.isArray(audioConfig)) {
            throw new Error('audioConfig must be an array');
        }
        
        audioConfig.forEach((config, index) => {
            if (!config.audioPath) {
                throw new Error(`audioConfig[${index}] must have audioPath`);
            }
            if (config.audioStartTime === undefined || config.audioEndTime === undefined) {
                throw new Error(`audioConfig[${index}] must have audioStartTime and audioEndTime`);
            }
            if (config.videoInsertTime === undefined) {
                throw new Error(`audioConfig[${index}] must have videoInsertTime`);
            }
        });
    }
};

app.post('/process-video', upload.array('media'), async (req, res) => {
    try {
        // Validate request
        validateRequest(req);
        
        const { theme, preset, clipConfig, imageConfig, audioConfig } = req.body;
        
        // Process YouTube URLs in clipConfig
        for (const clip of clipConfig) {
            if (clip.videoPath && isYoutubeUrl(clip.videoPath)) {
                try {
                    const downloadedPath = await downloadYoutubeVideo(clip.videoPath);
                    clip.videoPath = downloadedPath;
                } catch (error) {
                    throw new Error(`Failed to process YouTube video: ${error.message}`);
                }
            }
        }
        
        // Create VideoProcessor instance
        const processor = new VideoProcessor(theme, preset);
        
        // Process the video with imageConfig and audioConfig if present
        const outputPath = await processor.createVideo(clipConfig, imageConfig, audioConfig);
        
        // Send the video URL in response
        res.json({
            success: true,
            videoUrl: `/videos/${path.basename(outputPath)}`
        });
        
        // Set up cleanup after client downloads
        const cleanupTimeout = setTimeout(() => {
            processor.cleanupFile(outputPath);
            // Clean up uploaded files only
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
        }, 3600000); // Clean up after 1 hour
        
        // Store the timeout ID in the request object for potential cancellation
        req.cleanupTimeout = cleanupTimeout;
        
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
        
        // Clean up any uploaded files in case of error
        if (req.files) {
            req.files.forEach(file => {
                fs.unlinkSync(file.path);
            });
        }
    }
});

// Serve processed videos with proper headers and streaming support
app.use('/videos', (req, res, next) => {
    // Set headers for video files
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'video/mp4');
    next();
}, express.static(path.join(__dirname, 'src', 'output'), {
    maxAge: '1h',
    setHeaders: (res, path) => {
        // Add CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
    }
}));

// Add a specific endpoint for video information
app.get('/videos/:filename/info', (req, res) => {
    const videoPath = path.join(__dirname, 'src', 'output', req.params.filename);
    
    if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Video not found' });
    }

    const stats = fs.statSync(videoPath);
    res.json({
        filename: req.params.filename,
        size: stats.size,
        created: stats.birthtime,
        url: `/videos/${req.params.filename}`,
        expires: new Date(Date.now() + 3600000) // 1 hour from now
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});