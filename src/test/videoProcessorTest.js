import { fileURLToPath } from 'url';
import path from 'path';
import VideoProcessor from '../helpers/videoProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const theme = {
    fontName: 'Arial',
    textColor: 'white',
    backgroundColor: 'black',
    logoPath: null,
    maskPath: path.join(__dirname, '..', '..', 'media', 'masks', 'mask_black.png')
};

const videoSegments = [
    {
        videoPath: path.join(__dirname, '..', '..', 'media', 'yt-downloads', '9_minutes_of_life_changing_alex_hormozi_advice.mp4'),
        startTime: 5,
        endTime: 15,
        tagline: 'You have to push yourself\nNo one else is going to do\nit for you',
        hPercentage: 0.5
    },
    {
        videoPath: path.join(__dirname, '..', '..', 'media', 'yt-downloads', 'Andrew_Garfield_and_Elmo_Explain_Grief___Sesame_Workshop.mp4'),
        startTime: 10,
        endTime: 20,
        tagline: 'Discipline is doing what needs to be done\nEven if you don’t feel like doing it',
        hPercentage: 0.6
    },
    // {
    //     videoPath: path.join(__dirname, '..', '..', 'media', 'images', 'Logo_blue.png'),
    //     startTime: 0,
    //     endTime: 10,
    //     tagline: 'Discipline is doing what needs to be done\nEven if you don’t feel like doing it',
    //     hPercentage: 0.6
    // }
];

(async () => {
    const processor = new VideoProcessor(theme, 'square');

    try {
        const outputPath = await processor.createVideo(videoSegments);
        console.log('Final video created at:', outputPath);
    } catch (err) {
        console.error('Failed to process video:', err);
    }
})();
