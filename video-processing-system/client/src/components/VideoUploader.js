import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import styled from 'styled-components';
import axios from 'axios';

const UploaderContainer = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const Title = styled.h2`
  text-align: center;
  margin-bottom: 2rem;
  font-size: 2rem;
`;

const DropzoneArea = styled.div`
  border: 3px dashed ${props => props.isDragActive ? '#4ade80' : 'rgba(255, 255, 255, 0.3)'};
  border-radius: 1rem;
  padding: 3rem;
  text-align: center;
  background: ${props => props.isDragActive ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    border-color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
  }
`;

const DropzoneText = styled.p`
  font-size: 1.2rem;
  margin: 1rem 0;
`;

const FileInfo = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 1rem 0;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  margin: 1rem 0;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #4ade80, #22c55e);
  width: ${props => props.progress}%;
  transition: width 0.3s ease;
`;

const Button = styled.button`
  background: linear-gradient(135deg, #4ade80, #22c55e);
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease;
  margin: 0.5rem;

  &:hover {
    transform: translateY(-2px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ProcessingOptions = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
`;

const OptionGroup = styled.div`
  margin: 1rem 0;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
`;

const Checkbox = styled.input`
  margin-right: 0.5rem;
`;

const Slider = styled.input`
  width: 100%;
  margin: 0.5rem 0;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
`;

const ResultContainer = styled.div`
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid #4ade80;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
`;

function VideoUploader() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [processingOptions, setProcessingOptions] = useState({
    blur: { enabled: false, intensity: 15 },
    edgeDetection: { enabled: false, threshold1: 100, threshold2: 200 },
    colorFilter: { enabled: false, hueShift: 0 },
    mlEnhancement: { enabled: false, model: 'esrgan' },
    outputFormat: 'mp4',
    quality: 'high'
  });

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setUploadResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv']
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024 // 100MB
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('video', selectedFile);

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(progress);
        },
      });

      setUploadResult(response.data);
      console.log('Upload successful:', response.data);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcessing = async () => {
    if (!uploadResult?.videoId) return;

    setIsProcessing(true);

    try {
      const effects = {
        blur: processingOptions.blur.enabled ? {
          kernel_size: processingOptions.blur.intensity
        } : null,
        edge_detection: processingOptions.edgeDetection.enabled ? {
          threshold1: processingOptions.edgeDetection.threshold1,
          threshold2: processingOptions.edgeDetection.threshold2
        } : null,
        color_filter: processingOptions.colorFilter.enabled ? {
          hue_shift: processingOptions.colorFilter.hueShift
        } : null,
        ml_enhancement: processingOptions.mlEnhancement.enabled ? {
          model: processingOptions.mlEnhancement.model
        } : null
      };

      const response = await axios.post(`/api/video/${uploadResult.videoId}/process`, {
        effects,
        options: {
          output_format: processingOptions.outputFormat,
          quality: processingOptions.quality
        }
      });

      console.log('Processing started:', response.data);

      // Poll for processing status
      pollProcessingStatus(uploadResult.videoId);
    } catch (error) {
      console.error('Processing failed:', error);
      alert('Processing failed: ' + error.message);
      setIsProcessing(false);
    }
  };

  const pollProcessingStatus = async (videoId) => {
    try {
      const response = await axios.get(`/api/video/${videoId}/status`);
      const status = response.data;

      if (status.status === 'completed') {
        setIsProcessing(false);
        alert('Processing completed! You can now download the processed video.');
      } else if (status.status === 'failed') {
        setIsProcessing(false);
        alert('Processing failed: ' + status.error);
      } else {
        // Continue polling
        setTimeout(() => pollProcessingStatus(videoId), 2000);
      }
    } catch (error) {
      console.error('Status check failed:', error);
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!uploadResult?.videoId) return;

    try {
      const response = await axios.get(`/api/video/${uploadResult.videoId}/download`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `processed_${uploadResult.videoId}.mp4`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed: ' + error.message);
    }
  };

  const updateProcessingOption = (category, key, value) => {
    setProcessingOptions(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }));
  };

  return (
    <UploaderContainer>
      <Title>Video Upload & Processing</Title>

      <DropzoneArea {...getRootProps()} isDragActive={isDragActive}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <DropzoneText>Drop the video file here...</DropzoneText>
        ) : (
          <div>
            <DropzoneText>Drag & drop a video file here, or click to select</DropzoneText>
            <p>Supported formats: MP4, WebM, MOV, AVI, MKV (max 100MB)</p>
          </div>
        )}
      </DropzoneArea>

      {selectedFile && (
        <FileInfo>
          <h3>Selected File:</h3>
          <p><strong>Name:</strong> {selectedFile.name}</p>
          <p><strong>Size:</strong> {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
          <p><strong>Type:</strong> {selectedFile.type}</p>
        </FileInfo>
      )}

      {isUploading && (
        <div>
          <p>Uploading... {uploadProgress}%</p>
          <ProgressBar>
            <ProgressFill progress={uploadProgress} />
          </ProgressBar>
        </div>
      )}

      {selectedFile && !uploadResult && (
        <Button onClick={handleUpload} disabled={isUploading}>
          {isUploading ? 'Uploading...' : 'Upload Video'}
        </Button>
      )}

      {uploadResult && (
        <ProcessingOptions>
          <h3>Processing Options</h3>

          <OptionGroup>
            <Label>
              <Checkbox
                type="checkbox"
                checked={processingOptions.blur.enabled}
                onChange={(e) => updateProcessingOption('blur', 'enabled', e.target.checked)}
              />
              Blur Effect
            </Label>
            {processingOptions.blur.enabled && (
              <div>
                <Label>Intensity: {processingOptions.blur.intensity}</Label>
                <Slider
                  type="range"
                  min="5"
                  max="51"
                  step="2"
                  value={processingOptions.blur.intensity}
                  onChange={(e) => updateProcessingOption('blur', 'intensity', parseInt(e.target.value))}
                />
              </div>
            )}
          </OptionGroup>

          <OptionGroup>
            <Label>
              <Checkbox
                type="checkbox"
                checked={processingOptions.edgeDetection.enabled}
                onChange={(e) => updateProcessingOption('edgeDetection', 'enabled', e.target.checked)}
              />
              Edge Detection
            </Label>
          </OptionGroup>

          <OptionGroup>
            <Label>
              <Checkbox
                type="checkbox"
                checked={processingOptions.colorFilter.enabled}
                onChange={(e) => updateProcessingOption('colorFilter', 'enabled', e.target.checked)}
              />
              Color Filter
            </Label>
            {processingOptions.colorFilter.enabled && (
              <div>
                <Label>Hue Shift: {processingOptions.colorFilter.hueShift}</Label>
                <Slider
                  type="range"
                  min="-180"
                  max="180"
                  value={processingOptions.colorFilter.hueShift}
                  onChange={(e) => updateProcessingOption('colorFilter', 'hueShift', parseInt(e.target.value))}
                />
              </div>
            )}
          </OptionGroup>

          <OptionGroup>
            <Label>
              <Checkbox
                type="checkbox"
                checked={processingOptions.mlEnhancement.enabled}
                onChange={(e) => updateProcessingOption('mlEnhancement', 'enabled', e.target.checked)}
              />
              ML Enhancement
            </Label>
          </OptionGroup>

          <OptionGroup>
            <Label>Output Quality</Label>
            <Select
              value={processingOptions.quality}
              onChange={(e) => setProcessingOptions(prev => ({ ...prev, quality: e.target.value }))}
            >
              <option value="high">High Quality</option>
              <option value="medium">Medium Quality</option>
              <option value="low">Low Quality</option>
            </Select>
          </OptionGroup>

          <Button onClick={handleProcessing} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Start Processing'}
          </Button>

          <Button onClick={handleDownload}>
            Download Processed Video
          </Button>
        </ProcessingOptions>
      )}

      {uploadResult && (
        <ResultContainer>
          <h3>Upload Result</h3>
          <p><strong>Video ID:</strong> {uploadResult.videoId}</p>
          <p><strong>Original Name:</strong> {uploadResult.originalName}</p>
          <p><strong>File Size:</strong> {(uploadResult.size / (1024 * 1024)).toFixed(2)} MB</p>
        </ResultContainer>
      )}
    </UploaderContainer>
  );
}

export default VideoUploader;