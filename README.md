# Video Processing API

This API provides endpoints for processing and combining videos with customizable themes and presets. It supports both local media files and YouTube videos.

## Base URL

```
http://localhost:3000
```

## Endpoints

### Process Video

Process and combine multiple video clips with custom themes and effects.

**Endpoint:** `POST /process-video`

**Content-Type:** `multipart/form-data`

#### Request Body

The request should include both files and JSON data:

1. **Media Files:**
   - Upload your media files using the field name `media`
   - Supported formats: MP4, JPG, PNG, GIF, BMP, WEBP
   - Multiple files can be uploaded
   - YouTube URLs are also supported in the clipConfig

2. **JSON Configuration:**
   ```json
   {
     "theme": {
       "backgroundColor": "black",    // Background color for padding
       "textColor": "white",         // Color for text overlays
       "fontName": "Arial",          // Font for text overlays
       "logoPath": "path/to/logo.png", // Optional: Path to logo file
       "maskPath": "path/to/mask.png"  // Optional: Path to mask overlay
     },
     "preset": "wide",               // Video preset ("wide" or "square")
     "clipConfig": [
       {
         "videoPath": "path/to/video.mp4",  // Path to video file or YouTube URL
         "imagePath": "path/to/image.jpg",  // Alternative to videoPath for images
         "startTime": 0,                    // Start time in seconds
         "endTime": 5,                      // End time in seconds
         "tagline": "Your tagline here",    // Optional: Text overlay
         "hPercentage": 0.5                 // Optional: Horizontal position (0-1) for square preset
       }
     ]
   }
   ```

#### Response

**Success Response (200 OK)**
```json
{
  "success": true,
  "videoUrl": "/videos/processed_1234567890.mp4"
}
```

## Video Download

The processed videos are served with proper streaming support and can be downloaded in multiple ways:

### Direct Download
- Videos are available at `http://localhost:3000/videos/[filename].mp4`
- Supports range requests for partial downloads
- Videos are cached for 1 hour
- CORS enabled for cross-origin requests

### Video Information
Get video metadata and download information:
```
GET /videos/[filename]/info
```

Response:
```json
{
  "filename": "processed_1234567890.mp4",
  "size": 1234567,  // Size in bytes
  "created": "2024-03-14T12:00:00.000Z",
  "url": "/videos/processed_1234567890.mp4",
  "expires": "2024-03-14T13:00:00.000Z"  // 1 hour from creation
}
```

### Download Examples

#### Using cURL
```bash
# Download full video
curl -O http://localhost:3000/videos/processed_1234567890.mp4

# Download with progress
curl -O -J -L http://localhost:3000/videos/processed_1234567890.mp4

# Resume interrupted download
curl -C - -O http://localhost:3000/videos/processed_1234567890.mp4
```

#### Using JavaScript
```javascript
// Download with progress
async function downloadVideo(url, filename) {
    const response = await fetch(url);
    const reader = response.body.getReader();
    const contentLength = +response.headers.get('Content-Length');
    
    let receivedLength = 0;
    const chunks = [];
    
    while(true) {
        const {done, value} = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Log progress
        console.log(`Downloaded ${receivedLength} of ${contentLength} bytes`);
    }
    
    const blob = new Blob(chunks);
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.click();
}

// Usage
downloadVideo('http://localhost:3000/videos/processed_1234567890.mp4', 'video.mp4');
```

#### Using Python
```python
import requests

def download_video(url, filename):
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))
    
    with open(filename, 'wb') as file:
        for data in response.iter_content(chunk_size=4096):
            file.write(data)
            
# Usage
download_video('http://localhost:3000/videos/processed_1234567890.mp4', 'video.mp4')
```

### Notes
- Videos are automatically deleted after 1 hour
- Use the `/videos/[filename]/info` endpoint to check video availability and expiration
- The server supports range requests for resumable downloads
- CORS is enabled for cross-origin requests
- Videos are served with proper caching headers

**Error Response (400 Bad Request)**
```