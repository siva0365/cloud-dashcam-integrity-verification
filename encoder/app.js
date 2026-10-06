    // ==========================================
    // SUPABASE CLIENT
    // ==========================================

    const supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


    // ==========================================
    // HTML ELEMENTS
    // ==========================================

    const startButton =
        document.getElementById("startButton");

    const stopButton =
        document.getElementById("stopButton");

    const driverIdInput =
        document.getElementById("driverId");

    const statusText =
        document.getElementById("status");

    const cameraPreview =
        document.getElementById("cameraPreview");

    const frameCanvas =
        document.getElementById("frameCanvas");

    const frameCountDisplay =
        document.getElementById("frameCount");

    const hashCountDisplay =
        document.getElementById("hashCount");

    const uploadedCountDisplay =
        document.getElementById("uploadedCount");

    const recoveredCountDisplay =
        document.getElementById("recoveredCount");

    const pendingCountDisplay =
        document.getElementById("pendingCount");

    const networkStatusDisplay =
        document.getElementById("networkStatus");

    const cloudStatusDisplay =
        document.getElementById("cloudStatus");

    const lastHashDisplay =
        document.getElementById("lastHash");

    const lastTimestampDisplay =
        document.getElementById("lastTimestamp");

    const sessionIdDisplay =
        document.getElementById("sessionIdDisplay");

    const exportReferenceButton =
        document.getElementById("exportReferenceButton");

    const downloadVideoButton =
        document.getElementById("downloadVideoButton");

    // ==========================================
    // VIDEO FINGERPRINT SETTINGS
    // ==========================================

    const STRIP = 0.06;
    const BITS = 24;

    const GRID = 8;
    const SW = 320;
    const SH = 160;


    // ==========================================
    // VARIABLES
    // ==========================================

    let cameraStream = null;

    let frameInterval = null;

    let frameCount = 0;

    let hashCount = 0;

    let uploadedCount = 0;

    let recoveredCount = 0;

    let sessionFingerprints = [];

    let sessionId = null;

    let isFlushingQueue = false;

    let queueRetryInterval = null;

    let mediaRecorder = null;

    let recordedVideoChunks = [];

    let recordedVideoBlob = null;

    let recordedVideoUrl = null;

    // Canvas used for perceptual signature calculation
    const signatureCanvas =
        Object.assign(
            document.createElement("canvas"),
            {
                width: SW,
                height: SH
            }
        );

    const signatureContext =
        signatureCanvas.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );

    signatureContext.imageSmoothingQuality =
        "high";

    function hex2(value) {

        return value
            .toString(16)
            .padStart(2, "0");
    }

    function crc8(bytes) {

        let c = 0;

        for (const byte of bytes) {

            c ^= byte;

            for (let i = 0; i < 8; i++) {

                c =
                    (c & 0x80)
                        ? ((c << 1) ^ 0x07) & 0xFF
                        : (c << 1) & 0xFF;
            }
        }

        return c;
    }

    function drawFrameBarcode(index) {

        const high =
            (index >> 8) & 255;

        const low =
            index & 255;

        const crc =
            crc8([
                high,
                low
            ]);

        const bits = [
            high,
            low,
            crc
        ]
            .map(
                value =>
                    value
                        .toString(2)
                        .padStart(8, "0")
            )
            .join("");

        const barcodeHeight =
            Math.round(
                frameCanvas.height * STRIP
            );

        const blockWidth =
            frameCanvas.width / BITS;

        const context =
            frameCanvas.getContext("2d");

        for (
            let i = 0;
            i < BITS;
            i++
        ) {

            context.fillStyle =
                bits[i] === "1"
                    ? "#FFFFFF"
                    : "#000000";

            context.fillRect(
                Math.floor(
                    i * blockWidth
                ),
                0,
                Math.ceil(blockWidth),
                barcodeHeight
            );
        }
    }

    function computePerceptualSignature(
        sourceCanvas
    ) {

        const width =
            sourceCanvas.width;

        const height =
            sourceCanvas.height;

        const top =
            Math.round(
                height * STRIP
            );

        /*
        * Ignore the barcode strip.
        */

        signatureContext.drawImage(
            sourceCanvas,
            0,
            top,
            width,
            height - top,
            0,
            0,
            SW,
            SH
        );

        const imageData =
            signatureContext.getImageData(
                0,
                0,
                SW,
                SH
            );

        const data =
            imageData.data;

        const luminance =
            new Float32Array(
                SW * SH
            );

        /*
        * Convert RGB to luminance.
        */

        for (
            let i = 0;
            i < SW * SH;
            i++
        ) {

            luminance[i] =
                0.299 * data[i * 4] +
                0.587 * data[i * 4 + 1] +
                0.114 * data[i * 4 + 2];
        }

        const cellWidth =
            SW / GRID;

        const cellHeight =
            SH / GRID;

        let signature = "";

        /*
        * Calculate brightness and
        * edge/detail for each block.
        */

        for (
            let gridY = 0;
            gridY < GRID;
            gridY++
        ) {

            for (
                let gridX = 0;
                gridX < GRID;
                gridX++
            ) {

                let brightnessSum = 0;
                let detailSum = 0;
                let detailCount = 0;

                for (
                    let y =
                        gridY * cellHeight;
                    y <
                        (gridY + 1) *
                        cellHeight;
                    y++
                ) {

                    for (
                        let x =
                            gridX * cellWidth;
                        x <
                            (gridX + 1) *
                            cellWidth;
                        x++
                    ) {

                        const pixelX =
                            Math.floor(x);

                        const pixelY =
                            Math.floor(y);

                        const value =
                            luminance[
                                pixelY * SW +
                                pixelX
                            ];

                        brightnessSum +=
                            value;

                        if (
                            pixelX <
                                SW - 1 &&
                            pixelY <
                                SH - 1
                        ) {

                            const right =
                                luminance[
                                    pixelY * SW +
                                    pixelX + 1
                                ];

                            const down =
                                luminance[
                                    (pixelY + 1) *
                                        SW +
                                    pixelX
                                ];

                            detailSum +=
                                Math.abs(
                                    right - value
                                ) +
                                Math.abs(
                                    down - value
                                );

                            detailCount++;
                        }
                    }
                }

                const averageBrightness =
                    brightnessSum /
                    (cellWidth *
                        cellHeight);

                const detail =
                    Math.min(
                        255,
                        Math.round(
                            (
                                detailSum /
                                detailCount
                            ) * 8
                        )
                    );

                signature +=
                    hex2(
                        Math.round(
                            averageBrightness
                        )
                    );

                signature +=
                    hex2(detail);
            }
        }

        return signature;
    }

    async function sha256Text(
        text
    ) {

        const buffer =
            await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(text)
            );

        return Array
            .from(
                new Uint8Array(buffer)
            )
            .map(hex2)
            .join("");
    }

    // ==========================================
    // CONTINUOUS CAMERA CANVAS RENDERING
    // ==========================================

    let canvasRenderAnimation = null;
    let activeFrameIndex = 0;
    let lastBarcodeTime = 0;
    let isRecording = false;

    function renderCameraFrame(timestamp) {

        if (
            !cameraStream ||
            cameraPreview.videoWidth === 0 ||
            cameraPreview.videoHeight === 0
        ) {

            canvasRenderAnimation =
                requestAnimationFrame(
                    renderCameraFrame
                );

            return;
        }

        /*
        * Keep the canvas the same size
        * as the camera.
        */

        if (
            frameCanvas.width !==
            cameraPreview.videoWidth
        ) {

            frameCanvas.width =
                cameraPreview.videoWidth;
        }

        if (
            frameCanvas.height !==
            cameraPreview.videoHeight
        ) {

            frameCanvas.height =
                cameraPreview.videoHeight;
        }

        const context =
            frameCanvas.getContext("2d");

        /*
        * Draw the current camera image.
        */

        context.drawImage(
            cameraPreview,
            0,
            0,
            frameCanvas.width,
            frameCanvas.height
        );

       /*
* Keep the current cloud-frame barcode
* visible throughout the recording.
*
* The barcode changes only when a new
* cloud fingerprint is created.
*/

if (
    isRecording &&
    activeFrameIndex > 0
) {

    drawFrameBarcode(
        activeFrameIndex
    );

}

        canvasRenderAnimation =
            requestAnimationFrame(
                renderCameraFrame
            );

    }




    // ==========================================
    // DATA RETENTION
    // ==========================================

    const RETENTION_PERIOD_HOURS = 24;

    const RETENTION_PERIOD_MS =
        RETENTION_PERIOD_HOURS *
        60 *
        60 *
        1000;


    // ==========================================
    // LOCAL STORAGE QUEUE
    // ==========================================

    const QUEUE_KEY =
        "dashcam_pending_fingerprints";


    function getPendingQueue() {

        const storedQueue =
            localStorage.getItem(QUEUE_KEY);

        if (!storedQueue) {

            return [];
        }

        try {

            return JSON.parse(storedQueue);

        } catch (error) {

            console.error(
                "Unable to read pending queue:",
                error
            );

            return [];
        }
    }


    function savePendingQueue(queue) {

        localStorage.setItem(
            QUEUE_KEY,
            JSON.stringify(queue)
        );

        updatePendingCount();
    }


    function updatePendingCount() {

        const queue =
            getPendingQueue();

        if (pendingCountDisplay) {

            pendingCountDisplay.textContent =
                queue.length;
        }
    }


    // ==========================================
    // NETWORK STATUS
    // ==========================================

    function updateNetworkStatus() {

        if (!networkStatusDisplay) {

            return;
        }

        /*
        * Browser network status.
        * This does not guarantee that Supabase
        * is reachable.
        */

        if (navigator.onLine) {

            networkStatusDisplay.textContent =
                "ONLINE";

        } else {

            networkStatusDisplay.textContent =
                "OFFLINE";
        }
    }


    // ==========================================
    // BROWSER ONLINE EVENT
    // ==========================================

    window.addEventListener(
        "online",
        () => {

            updateNetworkStatus();

            console.log(
                "Browser reports network restored."
            );

            /*
            * Wait a few seconds before trying
            * to upload pending records.
            */

            setTimeout(
                () => {

                    flushPendingQueue();

                },
                3000
            );
        }
    );


    // ==========================================
    // BROWSER OFFLINE EVENT
    // ==========================================

    window.addEventListener(
        "offline",
        () => {

            updateNetworkStatus();

            console.log(
                "Browser reports network unavailable."
            );

            cloudStatusDisplay.textContent =
                "UNAVAILABLE";
        }
    );


    // ==========================================
    // INITIAL STATUS
    // ==========================================

    updateNetworkStatus();

    updatePendingCount();


    // ==========================================
    // START RECORDING
    // ==========================================

    startButton.addEventListener(
        "click",
        async () => {

            const driverId =
                driverIdInput.value.trim();

            if (driverId === "") {

                alert(
                    "Please enter a Driver ID."
                );

                return;
            }

            try {

                cameraStream =
                    await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });

                cameraPreview.srcObject =
                    cameraStream;

                // ==========================================
    // START ACTUAL VIDEO RECORDING
    // ==========================================

    recordedVideoChunks = [];

    recordedVideoBlob = null;

    if (recordedVideoUrl) {

        URL.revokeObjectURL(
            recordedVideoUrl
        );

        recordedVideoUrl = null;
    }

    activeFrameIndex = 0;
    lastBarcodeTime = 0;
    isRecording = true;

    canvasRenderAnimation =
        requestAnimationFrame(
            renderCameraFrame
        );

    mediaRecorder =
        new MediaRecorder(
            frameCanvas.captureStream(30),
            {
                mimeType: "video/webm",
                videoBitsPerSecond: 5000000
            }
        );

    mediaRecorder.ondataavailable =
        event => {

            if (event.data.size > 0) {

                recordedVideoChunks.push(
                    event.data
                );
            }
        };

    mediaRecorder.onstop =
        () => {

            recordedVideoBlob =
                new Blob(
                    recordedVideoChunks,
                    {
                        type:
                            mediaRecorder.mimeType ||
                            "video/webm"
                    }
                );

            console.log(
                "Video recording completed."
            );

            console.log(
                "Recorded video size:",
                recordedVideoBlob.size,
                "bytes"
            );
            if (downloadVideoButton) {

        downloadVideoButton.disabled =
            false;
    }

            statusText.textContent =
                "Status: Recording stopped. Video ready for download.";
        };

    mediaRecorder.start();

    console.log(
        "Actual video recording started."
    );


                // Reset counters

                frameCount = 0;

                hashCount = 0;

                uploadedCount = 0;

                recoveredCount = 0;


                // Create a new session

                sessionId =
                    crypto.randomUUID();


                if (sessionIdDisplay) {

                    sessionIdDisplay.textContent =
                        sessionId;
                }


                // Clear fingerprints from previous session

                sessionFingerprints = [];


                // Disable export until recording stops

    if (exportReferenceButton) {

        exportReferenceButton.disabled =
            true;
    }


    // Disable video download until recording stops

    if (downloadVideoButton) {

        downloadVideoButton.disabled =
            true;
    }


                // Reset display

                frameCountDisplay.textContent =
                    "0";

                hashCountDisplay.textContent =
                    "0";

                uploadedCountDisplay.textContent =
                    "0";


                if (recoveredCountDisplay) {

                    recoveredCountDisplay.textContent =
                        "0";
                }


                lastHashDisplay.textContent =
                    "None";

                lastTimestampDisplay.textContent =
                    "None";


                statusText.textContent =
                    "Status: Recording started for " +
                    driverId;


                cloudStatusDisplay.textContent =
                    "CHECKING";


                startButton.disabled =
                    true;

                stopButton.disabled =
                    false;


                /*
                * Capture one frame every second.
                */

                frameInterval =
                    setInterval(
                        captureFrame,
                        1000
                    );


            } catch (error) {

                console.error(
                    "Camera error:",
                    error
                );

                statusText.textContent =
                    "Status: Camera access failed.";

                alert(
                    "Unable to access the camera."
                );
            }
        }
    );

    // ==========================================
    // CAPTURE AND FINGERPRINT ONE FRAME
    // ==========================================

    async function captureFrame() {

        if (!cameraStream) {
            return;
        }

        if (
            cameraPreview.videoWidth === 0 ||
            cameraPreview.videoHeight === 0
        ) {

            console.log(
                "Camera frame is not ready yet."
            );

            return;
        }

        /*
        * Make sure the canvas has the
        * correct camera dimensions.
        */

        frameCanvas.width =
            cameraPreview.videoWidth;

        frameCanvas.height =
            cameraPreview.videoHeight;

        /*
        * Draw the current camera frame.
        */

        const context =
            frameCanvas.getContext("2d");

        context.drawImage(
            cameraPreview,
            0,
            0,
            frameCanvas.width,
            frameCanvas.height
        );

        /*
        * Increase frame number.
        */

        frameCount++;

        hashCount++;

        /*
* Synchronize the barcode with the
* cloud fingerprint frame number.
*
* One cloud fingerprint = one barcode.
*/
activeFrameIndex =
    frameCount;

        /*
        * Calculate perceptual signature
        * BEFORE drawing the barcode.
        *
        * The signature function ignores
        * the barcode strip anyway.
        */

        const signature =
            computePerceptualSignature(
                frameCanvas
            );

        /*
        * Draw the frame number barcode
        * into the recorded video.
        */

        drawFrameBarcode(
            frameCount
        );

        /*
        * Capture timestamp.
        */

        const timestamp =
            new Date().toISOString();

        /*
        * Create SHA-256 chain hash.
        *
        * This protects the complete
        * fingerprint record.
        */

        const fingerprint =
            await sha256Text(
                `${driverIdInput.value.trim()}|${sessionId}|${frameCount}|${timestamp}|${signature}`
            );

        /*
        * Update counters.
        */

        frameCountDisplay.textContent =
            frameCount;

        hashCountDisplay.textContent =
            hashCount;

        lastHashDisplay.textContent =
            fingerprint;

        lastTimestampDisplay.textContent =
            timestamp;

        /*
        * Create fingerprint record.
        */

        const fingerprintRecord = {

            fingerprint:
                fingerprint,

            signature:
                signature,

            fingerprint_timestamp:
                timestamp,

            driver_id:
                driverIdInput.value.trim(),

            session_id:
                sessionId,

            frame_number:
                frameCount
        };

        /*
        * Keep the record in memory
        * for the reference TXT export.
        */

        sessionFingerprints.push(
            fingerprintRecord
        );

        /*
        * Console information.
        */

        console.log(
            "Frame:",
            frameCount
        );

        console.log(
            "Perceptual signature:",
            signature
        );

        console.log(
            "SHA-256:",
            fingerprint
        );

        console.log(
            "Timestamp:",
            timestamp
        );

        /*
        * Upload to Supabase.
        */

        const uploaded =
            await uploadFingerprint(
                fingerprintRecord,
                true
            );

        /*
        * If upload fails, keep the
        * complete record in the offline queue.
        */

        if (!uploaded) {

            addToPendingQueue(
                fingerprintRecord
            );
        }
    }


    // ==========================================
    // UPLOAD ONE FINGERPRINT
    // ==========================================

    async function uploadFingerprint(
        fingerprintRecord,
        countAsSessionUpload = true
    ) {

        try {

            const {
                data,
                error
            } = await supabaseClient
                .from("video_fingerprints")
                .insert([
                    fingerprintRecord
                ])
                .select();


            // ==========================================
            // ERROR FROM SUPABASE
            // ==========================================

            if (error) {

                console.error(
                    "Supabase upload failed:",
                    error
                );

                console.log(
                    "Supabase error code:",
                    error.code
                );


                // ==========================================
                // DUPLICATE FINGERPRINT
                // ==========================================

                if (error.code === "23505") {

                    console.log(
                        "DUPLICATE FINGERPRINT FOUND."
                    );

                    console.log(
                        "Fingerprint already exists in Supabase:"
                    );

                    console.log(
                        fingerprintRecord.fingerprint
                    );

                    /*
                    * The fingerprint already exists
                    * in the cloud.
                    *
                    * Therefore it does NOT need
                    * to be uploaded again.
                    */

                    cloudStatusDisplay.textContent =
                        "CONNECTED";

                    return true;
                }


                // ==========================================
                // OTHER ERROR
                // ==========================================

                cloudStatusDisplay.textContent =
                    "ERROR";

                return false;
            }


            // ==========================================
            // NORMAL SUCCESS
            // ==========================================

            console.log(
                "Fingerprint uploaded successfully:",
                data
            );


            if (countAsSessionUpload) {

                uploadedCount++;

                uploadedCountDisplay.textContent =
                    uploadedCount;
            }


            cloudStatusDisplay.textContent =
                "CONNECTED";


            return true;


        } catch (error) {

            console.error(
                "Cloud connection failed:",
                error
            );

            cloudStatusDisplay.textContent =
                "ERROR";

            return false;
        }
    }


    // ==========================================
    // ADD TO LOCAL QUEUE
    // ==========================================

    function addToPendingQueue(
        fingerprintRecord
    ) {

        const queue =
            getPendingQueue();


        queue.push(
            fingerprintRecord
        );


        savePendingQueue(
            queue
        );


        console.log(
            "Fingerprint stored locally.",
            fingerprintRecord
        );


        statusText.textContent =
            "Status: Cloud unavailable - fingerprint stored locally.";


        cloudStatusDisplay.textContent =
            "ERROR";
    }


    // ==========================================
    // UPLOAD PENDING QUEUE
    // ==========================================

    // ==========================================
    // UPLOAD PENDING QUEUE
    // ==========================================

    async function flushPendingQueue() {

        // Prevent two recovery processes
        // from running at the same time.
        if (isFlushingQueue) {
            return;
        }

        const queue = getPendingQueue();

        // Nothing to recover.
        if (queue.length === 0) {
            updatePendingCount();
            return;
        }

        isFlushingQueue = true;

        console.log(
            "Attempting to recover",
            queue.length,
            "pending fingerprints..."
        );

        let remainingQueue = [...queue];
        let recoveredThisRun = 0;

        try {

            /*
            * Process the queue one fingerprint at a time.
            *
            * A fingerprint is removed ONLY after
            * Supabase confirms successful upload.
            */

            while (remainingQueue.length > 0) {

                const fingerprintRecord =
                    remainingQueue[0];

                console.log(
                    "Trying pending fingerprint:",
                    fingerprintRecord.frame_number
                );

                const uploaded =
                    await uploadFingerprint(
                        fingerprintRecord,
                        false
                    );

                /*
                * Upload failed.
                *
                * Keep this fingerprint and everything
                * after it in the queue.
                */

                if (!uploaded) {

                    console.log(
                        "Upload failed. Keeping remaining queue."
                    );

                    break;
                }

                /*
                * Upload succeeded.
                *
                * Now it is safe to remove this
                * fingerprint from the queue.
                */

                remainingQueue.shift();

                recoveredThisRun++;

                /*
                * Save immediately after every
                * successful upload.
                */

                savePendingQueue(
                    remainingQueue
                );

                console.log(
                    "Recovered fingerprint successfully."
                );

                console.log(
                    "Remaining pending:",
                    remainingQueue.length
                );
            }

        } catch (error) {

            console.error(
                "Queue recovery error:",
                error
            );

        } finally {

            /*
            * Always save the current queue.
            */

            savePendingQueue(
                remainingQueue
            );

            recoveredCount +=
                recoveredThisRun;

            if (recoveredCountDisplay) {

                recoveredCountDisplay.textContent =
                    recoveredCount;
            }

            isFlushingQueue = false;
        }


        /*
        * Update status.
        */

        if (remainingQueue.length === 0) {

            statusText.textContent =
                "Status: All pending fingerprints uploaded.";

            cloudStatusDisplay.textContent =
                "CONNECTED";

        } else {

            statusText.textContent =
                "Status: Some fingerprints remain pending.";

            cloudStatusDisplay.textContent =
                "ERROR";
        }


        console.log(
            "Recovered from queue:",
            recoveredThisRun
        );

        console.log(
            "Remaining pending:",
            remainingQueue.length
        );
    }


    // ==========================================
    // AUTOMATIC QUEUE RETRY
    // ==========================================

    function startQueueRetry() {

        /*
        * Don't create multiple retry timers.
        */

        if (queueRetryInterval) {
            return;
        }

        /*
        * Check every 5 seconds.
        */

        queueRetryInterval =
            setInterval(
                async () => {

                    const queue =
                        getPendingQueue();

                    /*
                    * If there are pending fingerprints,
                    * try to upload them.
                    *
                    * We do NOT depend only on
                    * navigator.onLine here.
                    */

                    if (
                        queue.length > 0 &&
                        !isFlushingQueue
                    ) {

                        console.log(
                            "Automatic retry: attempting pending uploads..."
                        );

                        await flushPendingQueue();
                    }

                },
                5000
            );
    }


    // Start automatic retry mechanism.

    startQueueRetry();


    // Start automatic retry mechanism.

    startQueueRetry();


    // ==========================================
    // STOP RECORDING
    // ==========================================

    stopButton.addEventListener(
        "click",
        () => {

            /*
            * Stop frame capture.
            */

            if (frameInterval) {

                clearInterval(
                    frameInterval
                );

                frameInterval =
                    null;
            }
            // ==========================================
    // STOP ACTUAL VIDEO RECORDING
    // ==========================================
    isRecording = false;

    if (canvasRenderAnimation) {

        cancelAnimationFrame(
            canvasRenderAnimation
        );

        canvasRenderAnimation =
            null;
    }

    if (
        mediaRecorder &&
        mediaRecorder.state !== "inactive"
    ) {

        mediaRecorder.stop();

        console.log(
            "Stopping actual video recording..."
        );
    }

            /*
            * Stop camera.
            */

            if (cameraStream) {

                cameraStream
                    .getTracks()
                    .forEach(track => {

                        track.stop();

                    });


                cameraStream =
                    null;


                cameraPreview.srcObject =
                    null;
            }


            statusText.textContent =
                "Status: Recording stopped | Frames captured: " +
                frameCount;


            startButton.disabled =
                false;

            stopButton.disabled =
                true;


            /*
            * Enable reference export.
            */

            if (
                exportReferenceButton &&
                sessionFingerprints.length > 0
            ) {

                exportReferenceButton.disabled =
                    false;
            }
        }
    );


    // ==========================================
    // EXPORT REFERENCE TXT
    // ==========================================

    if (exportReferenceButton) {

        exportReferenceButton.addEventListener(
            "click",
            () => {

                /*
                * Make sure there are fingerprints
                * available for this session.
                */

                if (
                    sessionFingerprints.length === 0
                ) {

                    alert(
                        "No fingerprints available for export."
                    );

                    return;
                }


                /*
                * Sort fingerprints by frame number.
                *
                * The Decoder expects:
                * line 1 = frame 1
                * line 2 = frame 2
                * etc.
                */

                const sortedFingerprints =
                    [...sessionFingerprints].sort(
                        (a, b) =>
                            a.frame_number -
                            b.frame_number
                    );


                /*
                * Create one fingerprint per line.
                */

                const text =
                    sortedFingerprints
                        .map(
                            record =>
                                record.fingerprint
                        )
                        .join("\n");


                /*
                * Create TXT file.
                */

                const blob =
                    new Blob(
                        [text],
                        {
                            type:
                                "text/plain"
                        }
                    );


                /*
                * Create temporary download URL.
                */

                const url =
                    URL.createObjectURL(blob);


                /*
                * Create temporary download link.
                */

                const link =
                    document.createElement("a");


                link.href =
                    url;


                /*
                * File name contains the
                * exact session ID.
                */

                link.download =
                    `fingerprints_${sessionId}.txt`;


                document.body.appendChild(
                    link
                );


                /*
                * Start browser download.
                */

                link.click();


                /*
                * Remove temporary link.
                */

                document.body.removeChild(
                    link
                );


                /*
                * Release temporary URL.
                */

                URL.revokeObjectURL(
                    url
                );


                console.log(
                    "Reference TXT exported successfully."
                );


                statusText.textContent =
                    "Status: Reference TXT exported successfully.";
            }
        );
    }

    // ==========================================
    // DOWNLOAD RECORDED VIDEO
    // ==========================================

    if (downloadVideoButton) {

        downloadVideoButton.addEventListener(
            "click",
            () => {

                if (!recordedVideoBlob) {

                    alert(
                        "No recorded video is available."
                    );

                    return;
                }


                if (recordedVideoUrl) {

                    URL.revokeObjectURL(
                        recordedVideoUrl
                    );
                }


                recordedVideoUrl =
                    URL.createObjectURL(
                        recordedVideoBlob
                    );


                const link =
                    document.createElement("a");


                link.href =
                    recordedVideoUrl;


                link.download =
                    `dashcam_${sessionId || "recording"}.webm`;


                document.body.appendChild(
                    link
                );


                link.click();


                document.body.removeChild(
                    link
                );


                console.log(
                    "Recorded video downloaded."
                );

                statusText.textContent =
                    "Status: Recorded video downloaded successfully.";
            }
        );
    }