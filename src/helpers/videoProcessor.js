import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure output directory path is absolute and normalized
const outputDir = path.resolve(__dirname, '..', 'output');

const PRESETS = {
    wide: {
        name: 'wide',
        textPositionY: 300,
        fontSize: 50
    },
    square: {
        name: 'square',
        textPositionY: 300,
        fontSize: 70
    }
}

class VideoProcessor {
    constructor(theme, presetKey = 'wide') {
        this.theme = theme;
        this.preset = PRESETS[presetKey];

        if (!this.preset) {
            throw new Error(`Invalid preset: ${presetKey}`);
        }

        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    }

    async processVideo(clipConfig) {
        // clipConfig {
        //     videoPath
        //     startTime
        //     endTime 
        //     tagline
        //     hPercentage
        //     muted
        // }
        const videoPath = clipConfig.videoPath;
        const startTime = clipConfig.startTime;
        const endTime = clipConfig.endTime;
        const tagline = clipConfig.tagline;
        const hPercentage = clipConfig.hPercentage;
        const muted = clipConfig.muted ?? false; // Default to false if not specified

        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video file not found: ${videoPath}`);
        }

        // Create a normalized, absolute path for the output file
        const tempOutputPath = path.resolve(outputDir, `processed_${Date.now()}.mp4`);
        console.log(`Creating output file at: ${tempOutputPath}`);

        // Check if the input is an image
        const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(videoPath);
        let inputVideoPath = videoPath;

        if (isImage) {
            // Create a video from the image with the theme's background color
            const imageVideoPath = path.resolve(outputDir, `image_video_${Date.now()}.mp4`);
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(videoPath)
                    .inputOptions(['-loop', '1'])
                    .outputOptions([
                        '-t', '10', // 10 seconds duration
                        '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p',
                        '-vf', `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:${this.theme.backgroundColor}`
                    ])
                    .output(imageVideoPath)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err))
                    .run();
            });
            inputVideoPath = imageVideoPath;
        }

        await new Promise((resolve, reject) => {
            let inputCount = 0;
            const ffmpegCommand = ffmpeg();
            ffmpegCommand.input(inputVideoPath)
                .setStartTime(startTime)
                .setDuration(endTime - startTime);

            let lines = [];
            if (tagline) {
                lines = tagline.split('\\n');
            }

            const filters = [];
            let logoIndex;
            let maskIndex;

            if (this.theme.logoPath) {
                ffmpegCommand.input(this.theme.logoPath);
                inputCount++;
                logoIndex = inputCount;
            }

            let lastOutput = '0:v'; // Default initial input

            if (this.preset.name === 'wide') {
                if (!isImage) { // Only apply scaling if it's not an image (already scaled)
                    filters.push(
                        {
                            filter: 'scale',
                            options: {
                                w: 1080,
                                h: 1920,
                                force_original_aspect_ratio: 'decrease'
                            },
                            inputs: '0:v',
                            outputs: 'scaled'
                        }, 
                        {
                            filter: 'pad',
                            options: {
                                w: 1080,
                                h: 1920,
                                x: '(ow-iw)/2',
                                y: '(oh-ih)/2',
                                color: this.theme.backgroundColor
                            },
                            inputs: 'scaled',
                            outputs: 'padded'
                        }
                    );
                    lastOutput = 'padded';
                }
            } else if (this.preset.name === 'square') {
                if (fs.existsSync(this.theme.maskPath)) {
                    ffmpegCommand.input(this.theme.maskPath);
                    inputCount++;
                    maskIndex = inputCount;
                    console.log('MaskIndex: ', maskIndex);
                } else {
                    console.log(`Mask doesn't exist at Maskpath!!!`);
                }

                if (!isImage) { // Only apply cropping if it's not an image
                    filters.push(
                        {
                            filter: 'crop',
                            options: {
                                w: 'ih',
                                h: 'ih',
                                x: 'max(0, min(iw - ih, (iw - ih) * ' + hPercentage + '))',
                                y: '0'
                            },
                            inputs: '0:v',
                            outputs: 'cropped'
                        },
                        {
                            filter: 'scale',
                            options: {
                                w: 360,
                                h: -2
                            },
                            inputs: 'cropped',
                            outputs: 'scaled'
                        },
                        {
                            filter: 'pad',
                            options: {
                                w: 400,
                                h: 400,
                                x: '(ow-iw)/2',
                                y: '(oh-ih)/2',
                                color: this.theme.backgroundColor
                            },
                            inputs: 'scaled',
                            outputs: 'padded'
                        },
                        {
                            filter: 'scale',
                            options: {
                                w: 1080,
                                h: 1920,
                                force_original_aspect_ratio: 'decrease'
                            },
                            inputs: 'padded',
                            outputs: 'scaled'
                        },
                        {
                            filter: 'pad',
                            options: {
                                w: 1080,
                                h: 1920,
                                x: '(ow-iw)/2',
                                y: '(oh-ih)/2',
                                color: this.theme.backgroundColor
                            },
                            inputs: 'scaled',
                            outputs: 'padded'
                        }
                    );
                    lastOutput = 'padded';
                }

                if (this.theme.maskPath && fs.existsSync(this.theme.maskPath)) {
                    // Add mask overlay
                    filters.push({
                        filter: 'scale',
                        options: {
                        w: 'iw',
                        h: 'ih'
                        },
                        inputs: `${maskIndex}:v`,
                        outputs: 'scaled_mask'
                    });

                    filters.push({
                        filter: 'overlay',
                        options: {
                        x: '(W-w)/2',
                        y: '(H-h)/2'
                        },
                        inputs: ['padded', 'scaled_mask'],
                        outputs: 'masked'
                    });
                    lastOutput = 'masked';
                }
            }

            // Add taglines according to this.preset.textPositionY
            if (lines.length > 0) {
                const lineHeight = 70;
                const totalTextHeight = lines.length * lineHeight;
                // const startY = `(h-${totalTextHeight})/2`;
                const startY = this.preset.textPositionY;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const outputName = `text${i}`;
                    const yPosition = `${startY}+${i * lineHeight}`;

                    filters.push({
                        filter: 'drawtext',
                        options: {
                            text: line,
                            font: this.theme.fontName || 'Arial',
                            fontsize: this.preset.fontSize,
                            fontcolor: this.theme.textColor || 'white',
                            x: '(w-tw)/2',
                            y: yPosition,
                            shadowcolor: this.theme.backgroundColor || 'black',
                            shadowx: 0,
                            shadowy: 0
                        },
                        inputs: lastOutput,
                        outputs: outputName
                    });

                    lastOutput = outputName;
                }
            }

            if (this.theme.logoPath && fs.existsSync(this.theme.logoPath)) {
                filters.push({
                    filter: 'scale',
                    options: {
                        w: 'iw*0.25',
                        h: 'ih*0.25'
                    },
                    inputs: `${logoIndex}:v`,
                    outputs: 'scaled_logo'
                });
        
                filters.push({
                    filter: 'overlay',
                    options: {
                        x: '(W-w)/2',
                        y: 'H*0.8-h/2'
                    },
                    inputs: [lastOutput, 'scaled_logo'],
                    outputs: 'output'
                });
                lastOutput = 'output';
            }

            console.log('LastOutput: ', lastOutput);

            // Add audio handling based on muted parameter
            if (muted) {
                // Add volume filter to the main filter chain
                filters.push({
                    filter: 'volume',
                    options: {
                        volume: 0
                    },
                    inputs: '0:a',
                    outputs: 'muted_audio'
                });
            }

            // Only apply complex filter if there are filters to apply
            if (filters.length > 0) {
                ffmpegCommand.complexFilter(filters);
                ffmpegCommand.outputOptions([
                    `-map [${lastOutput}]`, // use the last filter label for video
                    muted ? '-map [muted_audio]' : '-map 0:a?' // map either muted audio or original audio
                ]);
            }

            ffmpegCommand
                .output(tempOutputPath)
                .on('start', (commandLine) => {
                    console.log('FFmpeg command:', commandLine);
                })
                .on('end', () => {
                    console.log(`Successfully created: ${tempOutputPath}`);
                    resolve(tempOutputPath);
                })
                .on('error', (err) => {
                    console.error('FFmpeg error (first stage): ', err);
                    reject(err);
                });

            // Add standardized output options for consistent format
            ffmpegCommand.outputOptions([
                '-c:v', 'libx264',        // Use H.264 codec
                '-preset', 'medium',      // Balance between quality and encoding speed
                '-crf', '23',            // Constant Rate Factor for consistent quality
                '-pix_fmt', 'yuv420p',   // Standard pixel format
                '-r', '30',              // Standard frame rate
                '-movflags', '+faststart' // Enable fast start for web playback
            ]);

            // Add audio codec settings
            if (!muted) {
                ffmpegCommand.outputOptions(['-c:a', 'aac', '-b:a', '128k']); // Keep audio with AAC codec
            }

            ffmpegCommand.run();
        });

        return tempOutputPath;
    }

    async createVideo(videoSegments, imageConfig, audioConfig) {
        try {
            const processedSegments = [];
            
            for (const segment of videoSegments) {
                let processedVideoPath;
                const clipConfig = segment;

                processedVideoPath = await this.processVideo(clipConfig);
                processedSegments.push(processedVideoPath);
            }

            if (processedSegments.length === 1) {
                const finalVideo = processedSegments[0];
                let videoWithOverlays = finalVideo;
                
                if (imageConfig && imageConfig.length > 0) {
                    videoWithOverlays = await this.addImageOverlays(finalVideo, imageConfig);
                }
                
                if (audioConfig && audioConfig.length > 0) {
                    videoWithOverlays = await this.addAudioOverlays(videoWithOverlays, audioConfig);
                }
                
                return videoWithOverlays;
            }

            // Concatenate videos
            const finalOutputPath = path.resolve(outputDir, `final_${Date.now()}.mp4`);
            const tempListPath = path.resolve(outputDir, `temp_list_${Date.now()}.txt`);

            // Create a file list for ffmpeg
            const fileList = processedSegments.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
            fs.writeFileSync(tempListPath, fileList);

            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(tempListPath)
                    .inputOptions(['-f', 'concat', '-safe', '0'])
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-preset', 'medium',
                        '-crf', '23',
                        '-c:a', 'aac',
                        '-b:a', '128k'
                    ])
                    .output(finalOutputPath)
                    .on('start', (commandLine) => {
                        console.log('FFmpeg concat command:', commandLine);
                    })
                    .on('end', () => {
                        // Clean up temporary files
                        fs.unlinkSync(tempListPath);
                        processedSegments.forEach(p => {
                            if (fs.existsSync(p)) {
                                fs.unlinkSync(p);
                            }
                        });
                        console.log(`Successfully created final video: ${finalOutputPath}`);
                        resolve(finalOutputPath);
                    })
                    .on('error', (err) => {
                        console.error('Error concatenating videos: ', err);
                        reject(err);
                    })
                    .run();
            });

            let finalVideo = finalOutputPath;

            // Add image overlays if imageConfig are provided
            if (imageConfig && imageConfig.length > 0) {
                finalVideo = await this.addImageOverlays(finalOutputPath, imageConfig);
                // Clean up the intermediate video
                this.cleanupFile(finalOutputPath);
            }

            // Add audio overlays if audioConfig is provided
            if (audioConfig && audioConfig.length > 0) {
                const videoWithAudio = await this.addAudioOverlays(finalVideo, audioConfig);
                // Clean up the intermediate video
                this.cleanupFile(finalVideo);
                finalVideo = videoWithAudio;
            }

            return finalVideo;
        } catch (error) {
            console.error('Error creating video: ', error);
            throw error;
        }
    }

    async addImageOverlays(videoPath, imageConfig) {
        const outputPath = path.resolve(outputDir, `overlay_${Date.now()}.mp4`);

        // Verify all image files exist
        for (const config of imageConfig) {
            if (!fs.existsSync(config.imagePath)) {
                throw new Error(`Image file not found: ${config.imagePath}`);
            }
        }

        await new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg();
            
            // Add the video input
            ffmpegCommand.input(videoPath);
            
            // Add all image inputs
            imageConfig.forEach((config, index) => {
                ffmpegCommand.input(config.imagePath);
            });
            
            // Create the complex filter for the overlays
            const filters = [];
            let lastOutput = '0:v'; // Start with the video input

            // Add each overlay in sequence
            imageConfig.forEach((config, index) => {
                const { startTime, endTime, x, y } = config;
                const inputIndex = index + 1; // +1 because 0 is the video input
                
                filters.push({
                    filter: 'overlay',
                    options: {
                        x: x,
                        y: y,
                        enable: `between(t,${startTime},${endTime})`
                    },
                    inputs: [lastOutput, `${inputIndex}:v`],
                    outputs: `overlay${index}`
                });
                
                lastOutput = `overlay${index}`;
            });

            ffmpegCommand
                .complexFilter(filters)
                .outputOptions([
                    `-map [${lastOutput}]`,
                    '-map 0:a?'
                ])
                .output(outputPath)
                .on('start', (commandLine) => {
                    console.log('FFmpeg overlay command:', commandLine);
                })
                .on('end', () => {
                    console.log(`Successfully added image overlays: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('Error adding image overlays: ', err);
                    reject(err);
                })
                .run();
        });

        return outputPath;
    }

    async addAudioOverlays(videoPath, audioConfigs) {
        const outputPath = path.resolve(outputDir, `audio_overlay_${Date.now()}.mp4`);

        // Verify all audio files exist
        for (const config of audioConfigs) {
            if (!fs.existsSync(config.audioPath)) {
                throw new Error(`Audio file not found: ${config.audioPath}`);
            }
        }

        await new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg();
            
            // Add the video input
            ffmpegCommand.input(videoPath);
            
            // Add all audio inputs
            audioConfigs.forEach((config, index) => {
                ffmpegCommand.input(config.audioPath);
            });
            
            // Create the complex filter for the audio overlays
            const filters = [];
            let lastAudioOutput = '0:a'; // Start with the video's audio track
            
            // Process each audio configuration
            audioConfigs.forEach((config, index) => {
                const inputIndex = index + 1; // +1 because 0 is the video input
                
                // Extract the audio segment we want to use
                filters.push({
                    filter: 'atrim',
                    options: {
                        start: config.audioStartTime,
                        end: config.audioEndTime
                    },
                    inputs: `${inputIndex}:a`,
                    outputs: `trimmed_audio${index}`
                });

                // Add delay to position the audio at the correct timestamp
                filters.push({
                    filter: 'adelay',
                    options: {
                        delays: `${config.videoInsertTime * 1000}|${config.videoInsertTime * 1000}`
                    },
                    inputs: `trimmed_audio${index}`,
                    outputs: `delayed_audio${index}`
                });

                // Mix with the previous audio output
                filters.push({
                    filter: 'amix',
                    options: {
                        inputs: 2,
                        duration: 'longest'
                    },
                    inputs: [lastAudioOutput, `delayed_audio${index}`],
                    outputs: `mixed_audio${index}`
                });
                
                lastAudioOutput = `mixed_audio${index}`;
            });

            // Set up the output options
            const outputOptions = [
                '-map 0:v', // Map the video stream
                `-map [${lastAudioOutput}]`, // Map the final mixed audio
                '-c:v copy', // Copy video codec
                '-c:a aac', // Use AAC for audio
                '-b:a 192k' // Set audio bitrate
            ];

            ffmpegCommand
                .complexFilter(filters)
                .outputOptions(outputOptions)
                .output(outputPath)
                .on('start', (commandLine) => {
                    console.log('FFmpeg audio overlay command:', commandLine);
                })
                .on('end', () => {
                    console.log(`Successfully added audio overlays: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('Error adding audio overlays: ', err);
                    reject(err);
                })
                .run();
        });

        return outputPath;
    }

    cleanupFile(filePath) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

export default VideoProcessor;