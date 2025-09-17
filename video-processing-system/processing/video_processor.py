#!/usr/bin/env python3

import cv2
import numpy as np
import asyncio
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
import subprocess
import signal

try:
    import torch
    import torchvision.transforms as transforms
    GPU_AVAILABLE = torch.cuda.is_available()
except ImportError:
    print("PyTorch not available, using CPU-only processing")
    GPU_AVAILABLE = False

try:
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import Gst
    Gst.init(None)
    GSTREAMER_AVAILABLE = True
except ImportError:
    print("GStreamer not available, using OpenCV/FFmpeg fallback")
    GSTREAMER_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self, config_file='config.json'):
        self.config = self.load_config(config_file)
        self.active_streams = {}
        self.processing_queue = asyncio.Queue()
        self.executor = ThreadPoolExecutor(max_workers=self.config.get('max_workers', 4))
        self.lock = Lock()

        self.setup_gpu()
        self.setup_models()

        logger.info(f"VideoProcessor initialized - GPU: {GPU_AVAILABLE}, GStreamer: {GSTREAMER_AVAILABLE}")

    def load_config(self, config_file):
        default_config = {
            "gpu_enabled": True,
            "max_workers": 4,
            "output_formats": ["webrtc", "hls", "dash"],
            "processing_effects": {
                "blur": {"enabled": False, "kernel_size": 15},
                "edge_detection": {"enabled": False, "threshold1": 100, "threshold2": 200},
                "color_filter": {"enabled": False, "hue_shift": 0},
                "ml_enhancement": {"enabled": False, "model": "esrgan"}
            },
            "streaming": {
                "webrtc_bitrate": 2000000,
                "hls_segment_duration": 6,
                "dash_segment_duration": 4
            }
        }

        if os.path.exists(config_file):
            with open(config_file, 'r') as f:
                user_config = json.load(f)
                default_config.update(user_config)

        return default_config

    def setup_gpu(self):
        if GPU_AVAILABLE and self.config.get('gpu_enabled', True):
            self.device = torch.device('cuda')
            logger.info(f"GPU enabled: {torch.cuda.get_device_name()}")
        else:
            self.device = torch.device('cpu')
            logger.info("Using CPU processing")

    def setup_models(self):
        self.models = {}

        if GPU_AVAILABLE and self.config['processing_effects']['ml_enhancement']['enabled']:
            try:
                self.models['enhancement'] = self.load_enhancement_model()
            except Exception as e:
                logger.warning(f"Failed to load ML enhancement model: {e}")

    def load_enhancement_model(self):
        class SimpleEnhancer(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.conv1 = torch.nn.Conv2d(3, 64, 3, padding=1)
                self.conv2 = torch.nn.Conv2d(64, 64, 3, padding=1)
                self.conv3 = torch.nn.Conv2d(64, 3, 3, padding=1)
                self.relu = torch.nn.ReLU()

            def forward(self, x):
                x = self.relu(self.conv1(x))
                x = self.relu(self.conv2(x))
                x = self.conv3(x)
                return x

        model = SimpleEnhancer().to(self.device)
        return model

    async def process_rtmp_stream(self, stream_id, input_url):
        logger.info(f"Starting RTMP processing for stream {stream_id}")

        if GSTREAMER_AVAILABLE:
            pipeline = self.create_gstreamer_pipeline(input_url, stream_id)
        else:
            await self.process_with_opencv(input_url, stream_id)

    def create_gstreamer_pipeline(self, input_url, stream_id):
        pipeline_str = f"""
        rtspsrc location={input_url} !
        rtph264depay !
        h264parse !
        nvh264dec !
        videoconvert !
        video/x-raw,format=BGR !
        appsink name=sink emit-signals=true sync=false max-buffers=1 drop=true
        """

        pipeline = Gst.parse_launch(pipeline_str)

        sink = pipeline.get_by_name('sink')
        sink.connect('new-sample', self.on_gstreamer_frame, stream_id)

        pipeline.set_state(Gst.State.PLAYING)
        return pipeline

    def on_gstreamer_frame(self, sink, stream_id):
        sample = sink.emit('pull-sample')
        if sample:
            buffer = sample.get_buffer()
            caps = sample.get_caps()

            frame = self.gst_buffer_to_opencv(buffer, caps)
            if frame is not None:
                asyncio.create_task(self.process_frame(stream_id, frame))

        return Gst.FlowReturn.OK

    def gst_buffer_to_opencv(self, buffer, caps):
        try:
            caps_structure = caps.get_structure(0)
            width = caps_structure.get_value('width')
            height = caps_structure.get_value('height')

            success, map_info = buffer.map(Gst.MapFlags.READ)
            if not success:
                return None

            numpy_array = np.frombuffer(map_info.data, dtype=np.uint8)
            frame = numpy_array.reshape((height, width, 3))

            buffer.unmap(map_info)
            return frame
        except Exception as e:
            logger.error(f"Error converting GStreamer buffer: {e}")
            return None

    async def process_with_opencv(self, input_url, stream_id):
        cap = cv2.VideoCapture(input_url)

        if not cap.isOpened():
            logger.error(f"Failed to open video stream: {input_url}")
            return

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                await self.process_frame(stream_id, frame)

                if stream_id not in self.active_streams:
                    break

        finally:
            cap.release()

    async def process_frame(self, stream_id, frame):
        try:
            processed_frame = await self.apply_effects(frame)

            await self.output_frame(stream_id, processed_frame)

        except Exception as e:
            logger.error(f"Error processing frame for stream {stream_id}: {e}")

    async def apply_effects(self, frame):
        effects_config = self.config['processing_effects']
        processed_frame = frame.copy()

        if effects_config['blur']['enabled']:
            kernel_size = effects_config['blur']['kernel_size']
            processed_frame = cv2.GaussianBlur(processed_frame, (kernel_size, kernel_size), 0)

        if effects_config['edge_detection']['enabled']:
            gray = cv2.cvtColor(processed_frame, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray,
                            effects_config['edge_detection']['threshold1'],
                            effects_config['edge_detection']['threshold2'])
            processed_frame = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

        if effects_config['color_filter']['enabled']:
            hsv = cv2.cvtColor(processed_frame, cv2.COLOR_BGR2HSV)
            hsv[:,:,0] = (hsv[:,:,0] + effects_config['color_filter']['hue_shift']) % 180
            processed_frame = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

        if effects_config['ml_enhancement']['enabled'] and 'enhancement' in self.models:
            processed_frame = await self.apply_ml_enhancement(processed_frame)

        return processed_frame

    async def apply_ml_enhancement(self, frame):
        try:
            with torch.no_grad():
                frame_tensor = torch.from_numpy(frame).permute(2, 0, 1).float() / 255.0
                frame_tensor = frame_tensor.unsqueeze(0).to(self.device)

                enhanced = self.models['enhancement'](frame_tensor)
                enhanced = enhanced.squeeze(0).permute(1, 2, 0).cpu().numpy()
                enhanced = np.clip(enhanced * 255, 0, 255).astype(np.uint8)

                return enhanced
        except Exception as e:
            logger.error(f"ML enhancement failed: {e}")
            return frame

    async def output_frame(self, stream_id, frame):
        output_configs = self.active_streams.get(stream_id, {}).get('outputs', [])

        for output_config in output_configs:
            if output_config['type'] == 'webrtc':
                await self.output_webrtc(stream_id, frame, output_config)
            elif output_config['type'] == 'hls':
                await self.output_hls(stream_id, frame, output_config)
            elif output_config['type'] == 'dash':
                await self.output_dash(stream_id, frame, output_config)

    async def output_webrtc(self, stream_id, frame, config):
        try:
            encoded_frame = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])[1]

            self.send_to_webrtc_client(stream_id, encoded_frame.tobytes())
        except Exception as e:
            logger.error(f"WebRTC output error: {e}")

    async def output_hls(self, stream_id, frame, config):
        output_path = f"output/{stream_id}/hls"
        os.makedirs(output_path, exist_ok=True)

        ffmpeg_cmd = [
            'ffmpeg', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f"{frame.shape[1]}x{frame.shape[0]}", '-r', '30',
            '-i', 'pipe:0',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-hls_time', str(self.config['streaming']['hls_segment_duration']),
            '-hls_playlist_type', 'event',
            f"{output_path}/playlist.m3u8"
        ]

        try:
            if not hasattr(self, f'hls_process_{stream_id}'):
                process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)
                setattr(self, f'hls_process_{stream_id}', process)

            process = getattr(self, f'hls_process_{stream_id}')
            process.stdin.write(frame.tobytes())
            process.stdin.flush()

        except Exception as e:
            logger.error(f"HLS output error: {e}")

    async def output_dash(self, stream_id, frame, config):
        output_path = f"output/{stream_id}/dash"
        os.makedirs(output_path, exist_ok=True)

        ffmpeg_cmd = [
            'ffmpeg', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f"{frame.shape[1]}x{frame.shape[0]}", '-r', '30',
            '-i', 'pipe:0',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-seg_duration', str(self.config['streaming']['dash_segment_duration']),
            '-f', 'dash',
            f"{output_path}/manifest.mpd"
        ]

        try:
            if not hasattr(self, f'dash_process_{stream_id}'):
                process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)
                setattr(self, f'dash_process_{stream_id}', process)

            process = getattr(self, f'dash_process_{stream_id}')
            process.stdin.write(frame.tobytes())
            process.stdin.flush()

        except Exception as e:
            logger.error(f"DASH output error: {e}")

    def send_to_webrtc_client(self, stream_id, frame_data):
        pass

    def add_stream(self, stream_id, input_config, output_configs):
        with self.lock:
            self.active_streams[stream_id] = {
                'input': input_config,
                'outputs': output_configs,
                'start_time': time.time(),
                'frame_count': 0
            }

    def remove_stream(self, stream_id):
        with self.lock:
            if stream_id in self.active_streams:
                del self.active_streams[stream_id]

                for process_attr in [f'hls_process_{stream_id}', f'dash_process_{stream_id}']:
                    if hasattr(self, process_attr):
                        process = getattr(self, process_attr)
                        try:
                            process.stdin.close()
                            process.terminate()
                            process.wait(timeout=5)
                        except:
                            process.kill()
                        delattr(self, process_attr)

    def get_stream_stats(self, stream_id):
        if stream_id not in self.active_streams:
            return None

        stream = self.active_streams[stream_id]
        current_time = time.time()
        duration = current_time - stream['start_time']

        return {
            'stream_id': stream_id,
            'duration': duration,
            'frame_count': stream['frame_count'],
            'fps': stream['frame_count'] / duration if duration > 0 else 0,
            'input_type': stream['input']['type'],
            'output_types': [out['type'] for out in stream['outputs']]
        }

    def shutdown(self):
        logger.info("Shutting down VideoProcessor")

        for stream_id in list(self.active_streams.keys()):
            self.remove_stream(stream_id)

        self.executor.shutdown(wait=True)

if __name__ == "__main__":
    processor = VideoProcessor()

    def signal_handler(signum, frame):
        processor.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("Video processor started. Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        processor.shutdown()