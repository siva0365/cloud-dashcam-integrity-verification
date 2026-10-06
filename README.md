# Cloud-Based Dashcam Video Fingerprinting and Integrity Verification

## Project Overview

This project implements a cloud-based dashcam system for collecting video fingerprints and verifying the integrity of recorded video.

The system captures video frames through the Encoder, generates perceptual signatures and SHA-256 fingerprints, stores the fingerprint information in Supabase, and uses the Decoder to verify the recorded video against the cloud-stored data.

## System Architecture

The project consists of three main components:

1. **Encoder / Transmitter**
   - Captures frames from the camera.
   - Generates perceptual signatures.
   - Generates SHA-256 fingerprints.
   - Sends fingerprint information to the cloud.

2. **Supabase Cloud Backend**
   - Stores fingerprint records.
   - Stores frame numbers, timestamps, session information and signatures.
   - Provides persistent cloud storage for verification.

3. **Decoder**
   - Loads the recorded dashcam video.
   - Extracts and processes video frames.
   - Generates perceptual signatures.
   - Compares video frames with the corresponding cloud records.
   - Reports the integrity verification results.

## Main Features

- Real-time camera frame capture
- Perceptual signature generation
- SHA-256 fingerprint generation
- Cloud storage using Supabase
- Session and frame identification
- Temporary network interruption handling
- Local pending fingerprint queue
- Recorded video processing
- Frame-level integrity verification
- Verification reliability calculation

## Perceptual Signature

The system generates a perceptual signature for each video frame.

The frame is divided into an 8 × 8 grid. Visual information such as luminance and image details is calculated for each grid cell, producing a 256-character perceptual signature.

This approach allows the Decoder to compare visually similar frames even when normal video compression causes small pixel-level changes.

## SHA-256 Fingerprint

The perceptual signature is combined with information including:

- Driver ID
- Session ID
- Frame number
- Timestamp
- Perceptual signature

This information is used to generate a SHA-256 fingerprint for integrity verification.

## Technologies Used

- HTML
- CSS
- JavaScript
- Web Camera API
- Canvas API
- Web Crypto API
- MediaRecorder API
- LocalStorage
- Supabase
- PostgreSQL
- Visual Studio Code
- Google Chrome

## Project Structure

```text
cloud-dashcam-integrity-verification/
│
├── encoder/
│   ├── index.html
│   ├── app.js
│   ├── config.js
│   └── style.css
│
└── decoder/
    ├── index.html
    ├── app.js
    └── style.css
