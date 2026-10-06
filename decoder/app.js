// ==========================================
// SUPABASE CLIENT
// ==========================================

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


// ==========================================
// HTML ELEMENTS
// ==========================================

const driverIdInput =
    document.getElementById("driverId");

const sessionIdInput =
    document.getElementById("sessionId");

const loadButton =
    document.getElementById("loadButton");

const txtFileInput =
    document.getElementById("txtFile");

const fileStatus =
    document.getElementById("fileStatus");

const verifyButton =
    document.getElementById("verifyButton");

const verificationStatus =
    document.getElementById("verificationStatus");

const cloudCountDisplay =
    document.getElementById("cloudCount");

const referenceCountDisplay =
    document.getElementById("referenceCount");

const validCountDisplay =
    document.getElementById("validCount");

const invalidCountDisplay =
    document.getElementById("invalidCount");

const missingCountDisplay =
    document.getElementById("missingCount");

const extraCountDisplay =
    document.getElementById("extraCount");

const integrityStatusDisplay =
    document.getElementById("integrityStatus");

const reliabilityDisplay =
    document.getElementById("reliability");

const auditTableBody =
    document.getElementById("auditTableBody");

const logOutput =
    document.getElementById("logOutput");

const verificationBanner =
    document.getElementById("verificationBanner");

const bannerTitle =
    document.getElementById("bannerTitle");

const bannerMessage =
    document.getElementById("bannerMessage");

const videoFileInput =
    document.getElementById("videoFile");

const videoStatus =
    document.getElementById("videoStatus");

const videoPreview =
    document.getElementById("videoPreview");

const verifyVideoButton =
    document.getElementById("verifyVideoButton");

const videoVerificationStatus =
    document.getElementById(
        "videoVerificationStatus"
    );

const videoFrameCanvas =
    document.getElementById("videoFrameCanvas");

// ==========================================
// VIDEO FINGERPRINT SETTINGS
// ==========================================

const STRIP = 0.06;
const BITS = 24;

const GRID = 8;
const SW = 320;
const SH = 160;

const VIDEO_CANDIDATES_PER_FRAME = 5;

let videoFrameContext = null;

if (videoFrameCanvas) {

    videoFrameContext =
        videoFrameCanvas.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );

} else {

    console.error(
        "videoFrameCanvas was not found in decoder/index.html"
    );
}
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

// ==========================================
// READ FRAME NUMBER BARCODE
// ==========================================

function readFrameBarcode(
    context,
    width,
    height
) {

    const stripHeight =
        Math.max(
            1,
            Math.floor(
                height * STRIP
            )
        );

    /*
     * The encoder writes 24 large
     * black/white blocks.
     *
     * We sample the center area
     * of each block.
     */

    const blockWidth =
        width / BITS;

    const sampleY =
        Math.floor(
            stripHeight / 2
        );

    const bits = [];

    for (
        let i = 0;
        i < BITS;
        i++
    ) {

        const startX =
            Math.floor(
                i * blockWidth
            );

        const endX =
            Math.floor(
                (i + 1) *
                blockWidth
            );

        let totalBrightness = 0;

        let samples = 0;

        /*
         * Sample several pixels inside
         * the block instead of only one.
         * This makes barcode detection
         * more resistant to compression.
         */

        for (
            let x = startX + 2;
            x < endX - 2;
            x += Math.max(
                1,
                Math.floor(
                    blockWidth / 8
                )
            )
        ) {

            const pixel =
                context.getImageData(
                    x,
                    sampleY,
                    1,
                    1
                ).data;

            const brightness =
                (
                    pixel[0] +
                    pixel[1] +
                    pixel[2]
                ) / 3;

            totalBrightness +=
                brightness;

            samples++;

        }

        const average =
            samples > 0
                ? totalBrightness / samples
                : 255;

        bits.push(
            average >= 128
                ? 1
                : 0
        );

    }

    /*
     * Need all 24 bits.
     */

    if (
        bits.length !== BITS
    ) {

        return null;

    }

    /*
     * First 16 bits =
     * frame number.
     *
     * Last 8 bits =
     * CRC.
     */

    let frameIndex = 0;

    for (
        let i = 0;
        i < 16;
        i++
    ) {

        frameIndex =
            (frameIndex << 1) |
            bits[i];

    }

    const crcValue =
        bits
            .slice(16, 24)
            .reduce(
                (value, bit) =>
                    (value << 1) | bit,
                0
            );

    /*
     * Convert frame index into
     * two bytes.
     */

    const high =
        (frameIndex >> 8) & 0xFF;

    const low =
        frameIndex & 0xFF;

    const calculatedCRC =
        crc8([
            high,
            low
        ]);

    /*
     * Reject invalid barcode.
     */

    if (
        calculatedCRC !==
        crcValue
    ) {

        return null;

    }

    /*
     * Encoder starts frame numbering
     * at 1.
     */

    if (
        frameIndex < 1
    ) {

        return null;

    }

    return frameIndex;

}

// ==========================================
// PERCEPTUAL FRAME SIGNATURE
// ==========================================

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


    /*
     * Convert image to luminance.
     */

    const luminance =
        new Float32Array(
            SW * SH
        );


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
     * horizontal + vertical detail
     * for every cell.
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


                    /*
                     * Horizontal + vertical
                     * detail.
                     */

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
                (
                    cellWidth *
                    cellHeight
                );


            /*
             * IMPORTANT:
             * Same detail scaling as Encoder.
             */

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


            /*
             * Two hexadecimal characters
             * for brightness.
             */

            signature +=
                hex2(
                    Math.round(
                        averageBrightness
                    )
                );


            /*
             * Two hexadecimal characters
             * for detail.
             */

            signature +=
                hex2(
                    detail
                );

        }

    }


    return signature;
}

let videoFingerprints = [];


// ==========================================
// VARIABLES
// ==========================================

let cloudFingerprints = [];

let referenceFingerprints = [];


// ==========================================
// LOGGING
// ==========================================

function addLog(message) {

    const timestamp =
        new Date().toLocaleTimeString();

    logOutput.textContent +=
        "\n[" +
        timestamp +
        "] " +
        message;
}


// ==========================================
// UPDATE VERIFICATION BANNER
// ==========================================

function updateVerificationBanner(
    status
) {

    if (
        !verificationBanner ||
        !bannerTitle ||
        !bannerMessage
    ) {

        return;
    }


    /*
     * Reset classes.
     */

    verificationBanner.classList.remove(
        "verified",
        "problem",
        "waiting"
    );


    const statusIcon =
        verificationBanner.querySelector(
            ".status-icon"
        );


    if (status === "verified") {

        verificationBanner.classList.add(
            "verified"
        );


        if (statusIcon) {

            statusIcon.textContent =
                "✓";
        }


        bannerTitle.textContent =
            "Integrity Verified";


        bannerMessage.textContent =
            "All cloud fingerprints match the reference data.";


    } else if (status === "problem") {

        verificationBanner.classList.add(
            "problem"
        );


        if (statusIcon) {

            statusIcon.textContent =
                "!";
        }


        bannerTitle.textContent =
            "Integrity Issue Detected";


        bannerMessage.textContent =
            "One or more fingerprints are modified, missing, or unexpected.";


    } else {

        verificationBanner.classList.add(
            "waiting"
        );


        if (statusIcon) {

            statusIcon.textContent =
                "?";
        }


        bannerTitle.textContent =
            "Verification Not Started";


        bannerMessage.textContent =
            "Load the cloud fingerprints and reference file to begin verification.";
    }
}


// ==========================================
// INITIAL BANNER
// ==========================================

updateVerificationBanner(
    "waiting"
);


// ==========================================
// LOAD CLOUD FINGERPRINTS
// ==========================================

loadButton.addEventListener(
    "click",
    async () => {

        const driverId =
            driverIdInput.value.trim();

        const sessionId =
            sessionIdInput.value.trim();


        if (driverId === "") {

            alert(
                "Please enter a Driver ID."
            );

            return;
        }


        verificationStatus.textContent =
            "Loading fingerprints from Supabase...";


        cloudCountDisplay.textContent =
            "0";


        auditTableBody.innerHTML =
            "";


        updateVerificationBanner(
            "waiting"
        );


        addLog(
            "Loading cloud fingerprints..."
        );


        try {

            let query =
                supabaseClient
                    .from("video_fingerprints")
                    .select("*")
                    .eq(
                        "driver_id",
                        driverId
                    )
                    .order(
                        "frame_number",
                        {
                            ascending: true
                        }
                    );


            /*
             * If a Session ID was entered,
             * filter by that session.
             */

            if (sessionId !== "") {

                query =
                    query.eq(
                        "session_id",
                        sessionId
                    );
            }


            const {
                data,
                error
            } = await query;


            if (error) {

                console.error(
                    "Supabase query error:",
                    error
                );


                verificationStatus.textContent =
                    "Unable to load cloud fingerprints.";


                addLog(
                    "Supabase error: " +
                    error.message
                );


                return;
            }


            cloudFingerprints =
                data || [];


            cloudCountDisplay.textContent =
                cloudFingerprints.length;


            addLog(
                "Cloud fingerprints loaded: " +
                cloudFingerprints.length
            );


            /*
             * Display cloud records
             * in the audit table.
             */

            displayCloudFingerprints();


            if (
                cloudFingerprints.length === 0
            ) {

                verificationStatus.textContent =
                    "No fingerprints found for this Driver ID / Session.";

                return;
            }


            verificationStatus.textContent =
                "Cloud fingerprints loaded successfully.";


            /*
             * Enable verification if
             * reference file exists.
             */

            updateVerifyButton();

            if (
    verifyVideoButton &&
    videoFingerprints.length > 0 &&
    cloudFingerprints.length > 0
) {

    verifyVideoButton.disabled =
        false;

}


        } catch (error) {

            console.error(
                "Cloud loading failed:",
                error
            );


            verificationStatus.textContent =
                "Cloud connection failed.";


            addLog(
                "Connection error: " +
                error.message
            );
        }
    }
);


// ==========================================
// DISPLAY CLOUD FINGERPRINTS
// ==========================================

function displayCloudFingerprints() {

    auditTableBody.innerHTML =
        "";


    cloudFingerprints.forEach(
        record => {

            const row =
                document.createElement("tr");


            const frameCell =
                document.createElement("td");

            frameCell.textContent =
                record.frame_number;


            const timestampCell =
                document.createElement("td");

            timestampCell.textContent =
                record.fingerprint_timestamp;


            const cloudFingerprintCell =
                document.createElement("td");

            cloudFingerprintCell.textContent =
                record.fingerprint;


            const referenceCell =
                document.createElement("td");

            referenceCell.textContent =
                "Waiting for reference";


            const resultCell =
                document.createElement("td");

            resultCell.textContent =
                "NOT VERIFIED";


            row.appendChild(
                frameCell
            );

            row.appendChild(
                timestampCell
            );

            row.appendChild(
                cloudFingerprintCell
            );

            row.appendChild(
                referenceCell
            );

            row.appendChild(
                resultCell
            );


            auditTableBody.appendChild(
                row
            );
        }
    );
}


// ==========================================
// LOAD REFERENCE TXT FILE
// ==========================================

txtFileInput.addEventListener(
    "change",
    async event => {

        const file =
            event.target.files[0];


        if (!file) {

            return;
        }


        if (
            !file.name
                .toLowerCase()
                .endsWith(".txt")
        ) {

            fileStatus.textContent =
                "Please select a .txt file.";

            return;
        }


        try {

            const text =
                await file.text();


            /*
             * The reference file contains
             * one SHA-256 fingerprint per line.
             */

            referenceFingerprints =
                text
                    .split(/\r?\n/)
                    .map(
                        line =>
                            line.trim()
                    )
                    .filter(
                        line =>
                            line.length > 0
                    );


            /*
             * Validate SHA-256 format.
             *
             * SHA-256 hexadecimal =
             * 64 characters.
             */

            const invalidLines =
                referenceFingerprints.filter(
                    fingerprint =>
                        !/^[a-fA-F0-9]{64}$/
                            .test(
                                fingerprint
                            )
                );


            if (
                invalidLines.length > 0
            ) {

                fileStatus.textContent =
                    "Invalid reference file: " +
                    invalidLines.length +
                    " invalid fingerprint(s).";


                referenceFingerprints =
                    [];


                referenceCountDisplay.textContent =
                    "0";


                updateVerifyButton();

                return;
            }


            fileStatus.textContent =
                "Reference file loaded: " +
                referenceFingerprints.length +
                " fingerprint(s).";


            referenceCountDisplay.textContent =
                referenceFingerprints.length;


            addLog(
                "Reference TXT loaded: " +
                referenceFingerprints.length +
                " fingerprints."
            );


            updateVerifyButton();


        } catch (error) {

            console.error(
                "TXT file error:",
                error
            );


            fileStatus.textContent =
                "Unable to read the reference file.";


            referenceFingerprints =
                [];


            referenceCountDisplay.textContent =
                "0";


            updateVerifyButton();
        }
    }
);


// ==========================================
// ENABLE / DISABLE VERIFY BUTTON
// ==========================================

function updateVerifyButton() {

    verifyButton.disabled =
        !(
            cloudFingerprints.length > 0 &&
            referenceFingerprints.length > 0
        );
}


// ==========================================
// VERIFY INTEGRITY
// ==========================================

verifyButton.addEventListener(
    "click",
    () => {

        if (
            cloudFingerprints.length === 0
        ) {

            alert(
                "Load cloud fingerprints first."
            );

            return;
        }


        if (
            referenceFingerprints.length === 0
        ) {

            alert(
                "Load the reference TXT file first."
            );

            return;
        }


        addLog(
            "Starting integrity verification..."
        );


        verificationStatus.textContent =
            "Verifying fingerprint integrity...";


        updateVerificationBanner(
            "waiting"
        );


        /*
         * Reset counters.
         */

       let validCount = 0;

        let invalidCount = 0;
        let missingCount = 0;

        let extraCount = 0;


        /*
         * Create lookup maps.
         *
         * Reference TXT:
         * line 1 = frame 1
         * line 2 = frame 2
         *
         * Cloud records are ordered by
         * frame number.
         */

        const cloudMap =
            new Map();


        cloudFingerprints.forEach(
            record => {

                cloudMap.set(
                    Number(record.frame_number),
                    record
                );
            }
        );


        const referenceMap =
            new Map();


        referenceFingerprints.forEach(
            (
                fingerprint,
                index
            ) => {

                referenceMap.set(
                    index + 1,
                    fingerprint
                );
            }
        );


        /*
         * Compare every reference frame
         * against the corresponding cloud frame.
         */

        const maxFrames =
            Math.max(
                cloudFingerprints.length,
                referenceFingerprints.length
            );


        auditTableBody.innerHTML =
            "";


        for (
            let frameNumber = 1;
            frameNumber <= maxFrames;
            frameNumber++
        ) {

            const cloudRecord =
                cloudMap.get(
                    frameNumber
                );


            const referenceFingerprint =
                referenceMap.get(
                    frameNumber
                );


            const row =
                document.createElement("tr");


            /*
             * Cloud record missing.
             */

            if (!cloudRecord) {

                missingCount++;


                const frameCell =
                    document.createElement("td");

                frameCell.textContent =
                    frameNumber;


                const timestampCell =
                    document.createElement("td");

                timestampCell.textContent =
                    "-";


                const cloudCell =
                    document.createElement("td");

                cloudCell.textContent =
                    "MISSING";


                const referenceCell =
                    document.createElement("td");

                referenceCell.textContent =
                    referenceFingerprint;


                const resultCell =
                    document.createElement("td");

                resultCell.textContent =
                    "MISSING";


                resultCell.className =
                    "result-warning";


                row.appendChild(
                    frameCell
                );

                row.appendChild(
                    timestampCell
                );

                row.appendChild(
                    cloudCell
                );

                row.appendChild(
                    referenceCell
                );

                row.appendChild(
                    resultCell
                );


                auditTableBody.appendChild(
                    row
                );


                continue;
            }


            /*
             * Reference record missing.
             */

            if (!referenceFingerprint) {

                extraCount++;


                const frameCell =
                    document.createElement("td");

                frameCell.textContent =
                    frameNumber;


                const timestampCell =
                    document.createElement("td");

                timestampCell.textContent =
                    cloudRecord.fingerprint_timestamp;


                const cloudCell =
                    document.createElement("td");

                cloudCell.textContent =
                    cloudRecord.fingerprint;


                const referenceCell =
                    document.createElement("td");

                referenceCell.textContent =
                    "MISSING";


                const resultCell =
                    document.createElement("td");

                resultCell.textContent =
                    "EXTRA";


                resultCell.className =
                    "result-warning";


                row.appendChild(
                    frameCell
                );

                row.appendChild(
                    timestampCell
                );

                row.appendChild(
                    cloudCell
                );

                row.appendChild(
                    referenceCell
                );

                row.appendChild(
                    resultCell
                );


                auditTableBody.appendChild(
                    row
                );


                continue;
            }


            /*
             * Compare the two fingerprints.
             */

            const cloudFingerprint =
                cloudRecord.fingerprint
                    .toLowerCase();


            const referenceFingerprintNormalized =
                referenceFingerprint
                    .toLowerCase();


            const isValid =
                cloudFingerprint ===
                referenceFingerprintNormalized;


            const frameCell =
                document.createElement("td");

            frameCell.textContent =
                frameNumber;


            const timestampCell =
                document.createElement("td");

            timestampCell.textContent =
                cloudRecord.fingerprint_timestamp;


            const cloudCell =
                document.createElement("td");

            cloudCell.textContent =
                cloudRecord.fingerprint;


            const referenceCell =
                document.createElement("td");

            referenceCell.textContent =
                referenceFingerprint;


            const resultCell =
                document.createElement("td");


            if (isValid) {

                validCount++;


                resultCell.textContent =
                    "VALID";


                resultCell.className =
                    "result-valid";


            } else {

                videoInvalidCount++;


                resultCell.textContent =
                    "MODIFIED / CORRUPTED";


                resultCell.className =
                    "result-invalid";
            }


            row.appendChild(
                frameCell
            );

            row.appendChild(
                timestampCell
            );

            row.appendChild(
                cloudCell
            );

            row.appendChild(
                referenceCell
            );

            row.appendChild(
                resultCell
            );


            auditTableBody.appendChild(
                row
            );
        }


        /*
         * Update summary.
         */

        validCountDisplay.textContent =
            validCount;

        invalidCountDisplay.textContent =
            invalidCount;

        missingCountDisplay.textContent =
            missingCount;

        extraCountDisplay.textContent =
            extraCount;


        referenceCountDisplay.textContent =
            referenceFingerprints.length;


        cloudCountDisplay.textContent =
            cloudFingerprints.length;


        /*
         * Calculate reliability.
         *
         * Reliability =
         * valid fingerprints /
         * reference fingerprints × 100
         */

        let reliability = 0;


        if (
            referenceFingerprints.length > 0
        ) {

            reliability =
                (
                    validCount /
                    referenceFingerprints.length
                ) *
                100;
        }


        /*
         * Round to two decimal places.
         */

        reliability =
            Math.round(
                reliability * 100
            ) / 100;


        if (reliabilityDisplay) {

            reliabilityDisplay.textContent =
                reliability + "%";
        }


        /*
         * Determine overall integrity status.
         */

        if (
            invalidCount === 0 &&
            missingCount === 0 &&
            extraCount === 0 &&
            validCount ===
                referenceFingerprints.length
        ) {

            integrityStatusDisplay.textContent =
                "INTEGRITY VERIFIED";


            integrityStatusDisplay.className =
                "status-badge success";


            verificationStatus.textContent =
                "All fingerprints match the reference.";


            updateVerificationBanner(
                "verified"
            );


            addLog(
                "Integrity verification PASSED."
            );


        } else {

            integrityStatusDisplay.textContent =
                "INTEGRITY ISSUE DETECTED";


            integrityStatusDisplay.className =
                "status-badge error";


            verificationStatus.textContent =
                "One or more inconsistencies were detected.";


            updateVerificationBanner(
                "problem"
            );


            addLog(
                "Integrity verification detected inconsistencies."
            );
        }


        /*
         * Add detailed results to log.
         */

        addLog(
            "Valid: " +
            validCount
        );


        addLog(
            "Modified / corrupted: " +
            invalidCount
        );


        addLog(
            "Missing: " +
            missingCount
        );


        addLog(
            "Extra: " +
            extraCount
        );


        addLog(
            "Reliability: " +
            reliability +
            "%"
        );
    }
);

// ==========================================
// VIDEO FILE SELECTION
// ==========================================

if (videoFileInput) {

    videoFileInput.addEventListener(
        "change",
        () => {

            const file =
                videoFileInput.files[0];

            if (!file) {

                videoStatus.textContent =
                    "No video selected.";

                videoPreview.style.display =
                    "none";

                return;
            }


            /*
             * Create a temporary URL
             * for the selected video.
             */

            const videoUrl =
                URL.createObjectURL(file);


            videoPreview.src =
                videoUrl;

            videoPreview.style.display =
                "block";


            videoStatus.textContent =
                "Video selected: " +
                file.name;


            console.log(
                "Video selected:",
                file.name
            );

            console.log(
                "Video size:",
                file.size,
                "bytes"
            );

            console.log(
                "Video type:",
                file.type
            );
            extractVideoFingerprints();
        }
    );
}
// ==========================================
// EXTRACT FINGERPRINTS FROM RECORDED VIDEO
// ==========================================

async function extractVideoFingerprints() {

    videoFingerprints = [];

    if (
        !videoPreview ||
        !videoPreview.src
    ) {

        console.log(
            "No video selected."
        );

        return;

    }

    /*
     * Wait for video metadata.
     */

    if (
        videoPreview.readyState < 1
    ) {

        await new Promise(
            resolve => {

                videoPreview.addEventListener(
                    "loadedmetadata",
                    resolve,
                    {
                        once: true
                    }
                );

            }
        );

    }

    const duration =
        videoPreview.duration;

    const width =
        videoPreview.videoWidth;

    const height =
        videoPreview.videoHeight;

    if (
        !duration ||
        !isFinite(duration) ||
        !width ||
        !height
    ) {

        console.error(
            "Unable to read video dimensions or duration."
        );

        return;

    }

    videoFrameCanvas.width =
        width;

    videoFrameCanvas.height =
        height;

    console.log(
        "===================================="
    );

    console.log(
        "Starting video fingerprint extraction..."
    );

    console.log(
        "Video duration:",
        duration,
        "seconds"
    );

    console.log(
        "Video resolution:",
        width,
        "x",
        height
    );

    /*
     * A video frame may be decoded more
     * than once.
     *
     * Store several candidates for the
     * same frame number.
     */

    const candidates =
        new Map();

    let decodedFrameCount = 0;

    let barcodeFrameCount = 0;

    /*
     * Add a signature candidate.
     */

    function addCandidate(
        frameIndex,
        signature
    ) {

        if (
            frameIndex === null ||
            frameIndex === undefined ||
            frameIndex < 1 ||
            !signature
        ) {

            return;

        }

        if (
            !candidates.has(
                frameIndex
            )
        ) {

            candidates.set(
                frameIndex,
                []
            );

        }

        const list =
            candidates.get(
                frameIndex
            );

        if (
            !list.includes(
                signature
            ) &&
            list.length <
                VIDEO_CANDIDATES_PER_FRAME
        ) {

            list.push(
                signature
            );

        }

    }

    /*
     * Capture the currently decoded
     * video frame.
     */

    function captureCurrentFrame() {

        if (
            videoPreview.readyState <
            HTMLMediaElement.HAVE_CURRENT_DATA
        ) {

            return;

        }

        videoFrameContext.drawImage(
            videoPreview,
            0,
            0,
            videoFrameCanvas.width,
            videoFrameCanvas.height
        );

        decodedFrameCount++;

        /*
         * Read frame number from barcode.
         */

        const frameIndex =
            readFrameBarcode(
                videoFrameContext,
                videoFrameCanvas.width,
                videoFrameCanvas.height
            );

        if (
            frameIndex === null
        ) {

            return;

        }

        barcodeFrameCount++;

        /*
         * Barcode occupies the top strip.
         *
         * computePerceptualSignature()
         * automatically ignores that strip.
         */

        const signature =
            computePerceptualSignature(
                videoFrameCanvas
            );

        addCandidate(
            frameIndex,
            signature
        );

    }

    /*
     * requestVideoFrameCallback()
     * processes frames actually decoded
     * by the browser.
     */

    let fallbackInterval =
        null;

    let callbackStarted =
        false;

    const collectFrames =
        () => {

            if (
                videoPreview.paused ||
                videoPreview.ended
            ) {

                return;

            }

            captureCurrentFrame();

            if (
                typeof videoPreview.requestVideoFrameCallback ===
                "function"
            ) {

                videoPreview.requestVideoFrameCallback(
                    collectFrames
                );

            }

        };

    /*
     * Start from the beginning.
     */

    videoPreview.pause();

    /*
     * Register the seek listener BEFORE
     * changing currentTime.
     */

    await new Promise(
        resolve => {

            const handleSeeked =
                () => {

                    videoPreview.removeEventListener(
                        "seeked",
                        handleSeeked
                    );

                    resolve();

                };

            videoPreview.addEventListener(
                "seeked",
                handleSeeked
            );

            videoPreview.currentTime =
                0;

            /*
             * If already at zero, resolve.
             */

            if (
                videoPreview.currentTime === 0
            ) {

                setTimeout(
                    resolve,
                    50
                );

            }

        }
    );

    /*
     * Start video playback.
     */

    try {

        await videoPreview.play();

    } catch (error) {

        console.error(
            "Could not start video playback:",
            error
        );

        if (
            videoStatus
        ) {

            videoStatus.textContent =
                "Unable to play the selected video.";

        }

        return;

    }

    /*
     * Start frame collection.
     */

    if (
        typeof videoPreview.requestVideoFrameCallback ===
        "function"
    ) {

        callbackStarted =
            true;

        videoPreview.requestVideoFrameCallback(
            collectFrames
        );

    } else {

        /*
         * Fallback for browsers without
         * requestVideoFrameCallback().
         */

        fallbackInterval =
            setInterval(
                () => {

                    if (
                        videoPreview.paused ||
                        videoPreview.ended
                    ) {

                        clearInterval(
                            fallbackInterval
                        );

                        fallbackInterval =
                            null;

                        return;

                    }

                    captureCurrentFrame();

                },
                33
            );

    }

    /*
     * Wait until video finishes.
     */

    await new Promise(
        resolve => {

            let finished =
                false;

            const finish =
                () => {

                    if (
                        finished
                    ) {

                        return;

                    }

                    finished =
                        true;

                    videoPreview.removeEventListener(
                        "ended",
                        finish
                    );

                    if (
                        fallbackInterval
                    ) {

                        clearInterval(
                            fallbackInterval
                        );

                        fallbackInterval =
                            null;

                    }

                    resolve();

                };

            videoPreview.addEventListener(
                "ended",
                finish
            );

            /*
             * Safety check.
             */

            if (
                videoPreview.ended
            ) {

                finish();

            }

        }
    );

    /*
     * Convert candidate Map into
     * videoFingerprints array.
     */

    for (
        const [
            frameNumber,
            signatures
        ]
        of candidates.entries()
    ) {

        for (
            const signature
            of signatures
        ) {

            videoFingerprints.push({

                frame_number:
                    Number(
                        frameNumber
                    ),

                signature:
                    signature

            });

        }

    }

    /*
     * Sort by frame number.
     */

    videoFingerprints.sort(
        (
            a,
            b
        ) =>
            a.frame_number -
            b.frame_number
    );

    console.log(
        "===================================="
    );

    console.log(
        "Video fingerprint extraction complete."
    );

    console.log(
        "Decoded video frames:",
        decodedFrameCount
    );

    console.log(
        "Frames with valid barcodes:",
        barcodeFrameCount
    );

    console.log(
        "Unique barcode frame numbers:",
        candidates.size
    );
    console.log(
    "Detected frame numbers:",
    JSON.stringify(
        Array.from(candidates.keys())
    )
 );

    console.log(
        "Fingerprint candidates:",
        videoFingerprints.length
    );

    console.log(
        "===================================="
    );

    if (
        videoFingerprints.length === 0
    ) {

        console.warn(
            "No valid frame barcodes were detected."
        );

        if (
            videoStatus
        ) {

            videoStatus.textContent =
                "Video processed, but no valid frame barcodes were detected.";

        }

        return;

    }

    if (
        videoStatus
    ) {

        videoStatus.textContent =
            "Video processed: " +
            candidates.size +
            " frame number(s) detected.";

    }

    /*
     * Enable video verification when
     * both video and cloud data exist.
     */

    if (
        verifyVideoButton &&
        videoFingerprints.length > 0 &&
        cloudFingerprints.length > 0
    ) {

        verifyVideoButton.disabled =
            false;

    }

}
// ==========================================
// COMPRESSION-TOLERANT SIGNATURE COMPARISON
// ==========================================

function compareSignatures(
    videoSignature,
    cloudSignature
) {

    if (
        !videoSignature ||
        !cloudSignature
    ) {

        return {
            match: false,
            profile: "none",
            badCells: Infinity,
            maxLuminanceDifference: Infinity,
            score: 0
        };

    }


    /*
     * Every signature contains:
     *
     * 64 cells
     * 4 hexadecimal characters per cell
     *
     * Total = 256 characters.
     */

    const expectedLength =
        GRID * GRID * 4;


    if (
        videoSignature.length !==
            expectedLength ||

        cloudSignature.length !==
            expectedLength
    ) {

        return {
            match: false,
            profile: "invalid-length",
            badCells: Infinity,
            maxLuminanceDifference: Infinity,
            score: 0
        };

    }


    /*
     * Compression-tolerant profiles.
     */

    const profiles = [

        {
            name: "strict",

            lumTolerance: 12,

            detailThreshold: 0.70,

            maxCells: 0
        },

        {
            name: "normal",

            lumTolerance: 20,

            detailThreshold: 0.55,

            maxCells: 1
        },

        {
            name: "lenient",

            lumTolerance: 30,

            detailThreshold: 0.40,

            maxCells: 3
        }

    ];


    let bestResult = null;


    /*
     * Try each tolerance profile.
     */

    for (
        const profile of profiles
    ) {

        let badCells = 0;

        let maxLuminanceDifference = 0;


        /*
         * Compare all 64 cells.
         */

        for (
            let cell = 0;

            cell < GRID * GRID;

            cell++
        ) {

            const position =
                cell * 4;


            /*
             * Brightness.
             */

            const videoBrightness =
                parseInt(
                    videoSignature.slice(
                        position,
                        position + 2
                    ),
                    16
                );


            const cloudBrightness =
                parseInt(
                    cloudSignature.slice(
                        position,
                        position + 2
                    ),
                    16
                );


            /*
             * Detail.
             */

            const videoDetail =
                parseInt(
                    videoSignature.slice(
                        position + 2,
                        position + 4
                    ),
                    16
                );


            const cloudDetail =
                parseInt(
                    cloudSignature.slice(
                        position + 2,
                        position + 4
                    ),
                    16
                );


            /*
             * Brightness difference.
             */

            const luminanceDifference =
                Math.abs(
                    videoBrightness -
                    cloudBrightness
                );


            /*
             * Detail similarity.
             */

            let detailSimilarity;


            if (
                videoDetail === 0 &&
                cloudDetail === 0
            ) {

                detailSimilarity = 1;

            } else {

                const maxDetail =
                    Math.max(
                        videoDetail,
                        cloudDetail
                    );


                const minDetail =
                    Math.min(
                        videoDetail,
                        cloudDetail
                    );


                detailSimilarity =
                    maxDetail === 0
                        ? 1
                        : minDetail /
                          maxDetail;
            }


            /*
             * Count a cell as different
             * if it fails either condition.
             */

            if (
                luminanceDifference >
                    profile.lumTolerance ||

                detailSimilarity <
                    profile.detailThreshold
            ) {

                badCells++;
            }


            maxLuminanceDifference =
                Math.max(
                    maxLuminanceDifference,
                    luminanceDifference
                );

        }


        /*
         * Calculate similarity score.
         *
         * 64 cells total.
         */

        const score =
            (
                (GRID * GRID - badCells) /
                (GRID * GRID)
            ) * 100;


        const result = {

            match:
                badCells <=
                profile.maxCells,

            valid:
                badCells <=
                profile.maxCells,

            profile:
                profile.name,

            badCells:
                badCells,

            maxLuminanceDifference:
                maxLuminanceDifference,

            score:
                score

        };


        /*
         * If accepted by this profile,
         * return immediately.
         */

        if (
            result.match
        ) {

            return result;
        }


        /*
         * Keep the best failed result.
         */

        if (
            bestResult === null ||
            result.score >
                bestResult.score
        ) {

            bestResult =
                result;
        }

    }


    return bestResult;
}

// ==========================================
// VERIFY RECORDED VIDEO AGAINST CLOUD
// ==========================================

function verifyVideoAgainstCloud() {

    if (videoFingerprints.length === 0) {

        alert(
            "No video fingerprints available."
        );

        return;
    }


    if (cloudFingerprints.length === 0) {

        alert(
            "Load cloud fingerprints first."
        );

        return;
    }


    console.log(
        "===================================="
    );

    console.log(
        "Starting video verification..."
    );

    console.log(
        "===================================="
    );


    addLog(
        "Starting video fingerprint verification..."
    );


    videoVerificationStatus.textContent =
        "Comparing cloud fingerprints with recorded video...";


    let validCount = 0;
    let differentCount = 0;
    let missingCount = 0;


    let strictMatches = 0;
    let normalMatches = 0;
    let lenientMatches = 0;


    // ==========================================
    // CREATE AUDIT ROW LOOKUP
    // ==========================================

    const auditRows = new Map();


    if (auditTableBody) {

        const rows =
            auditTableBody.querySelectorAll("tr");

        rows.forEach(row => {

            const frameCell =
                row.cells[0];

            if (!frameCell) {
                return;
            }

            const frameNumber =
                Number(
                    frameCell.textContent.trim()
                );

            if (
                Number.isFinite(frameNumber)
            ) {

                auditRows.set(
                    frameNumber,
                    row
                );
            }

        });

    }


    /*
     * Group video signatures by barcode.
     */

    const videoMap =
        new Map();


    for (
        const videoRecord
        of videoFingerprints
    ) {

        const frameNumber =
            Number(
                videoRecord.frame_number
            );


        if (
            !videoMap.has(
                frameNumber
            )
        ) {

            videoMap.set(
                frameNumber,
                []
            );
        }


        videoMap
            .get(frameNumber)
            .push(
                videoRecord.signature
            );
    }


    /*
     * Check every cloud frame.
     */

    for (
        const cloudRecord
        of cloudFingerprints
    ) {

        const frameNumber =
            Number(
                cloudRecord.frame_number
            );


        const cloudSignature =
            cloudRecord.signature;


        console.log(
            "Checking cloud frame:",
            frameNumber
        );


        /*
         * Find all video candidates
         * having this barcode.
         */

        const candidates =
            videoMap.get(
                frameNumber
            );


        /*
         * Get the existing audit row.
         */

        const auditRow =
            auditRows.get(
                frameNumber
            );


        /*
         * Barcode not found in video.
         */

        if (
            !candidates ||
            candidates.length === 0
        ) {

            missingCount++;


            console.warn(
                "MISSING VIDEO FRAME:",
                frameNumber
            );


            /*
             * Update Fingerprint Audit.
             */

            if (auditRow) {

                const referenceCell =
                    auditRow.cells[3];

                const resultCell =
                    auditRow.cells[4];


                if (referenceCell) {

                    referenceCell.textContent =
                        "No video reference";
                }


                if (resultCell) {

                    resultCell.textContent =
                        "MISSING";

                    resultCell.className =
                        "result-warning";
                }

            }


            continue;
        }


        /*
         * Compare the cloud signature
         * against every video candidate.
         */

        let bestResult =
            null;

        let bestVideoSignature =
            null;


        for (
            const videoSignature
            of candidates
        ) {

            const result =
                compareSignatures(
                    cloudSignature,
                    videoSignature
                );


            if (
                !bestResult ||
                result.score >
                    bestResult.score
            ) {

                bestResult =
                    result;

                bestVideoSignature =
                    videoSignature;
            }


            /*
             * Strict match is already sufficient.
             */

            if (
                result.profile ===
                "strict"
            ) {

                break;
            }

        }


        /*
         * Update Fingerprint Audit
         * with the video reference.
         */

        if (auditRow) {

            const referenceCell =
                auditRow.cells[3];

            const resultCell =
                auditRow.cells[4];


            if (referenceCell) {

                referenceCell.textContent =
                    bestVideoSignature ||
                    "No video reference";
            }


            if (resultCell) {

                if (
                    bestResult &&
                    bestResult.match
                ) {

                    resultCell.textContent =
                        "VALID";

                    resultCell.className =
                        "result-valid";

                } else {

                    resultCell.textContent =
                        "MODIFIED / CORRUPTED";

                    resultCell.className =
                        "result-invalid";
                }

            }

        }


        /*
         * Valid frame.
         */

        if (
            bestResult &&
            bestResult.match
        ) {

            validCount++;


            if (
                bestResult.profile ===
                "strict"
            ) {

                strictMatches++;

            } else if (
                bestResult.profile ===
                "normal"
            ) {

                normalMatches++;

            } else if (
                bestResult.profile ===
                "lenient"
            ) {

                lenientMatches++;
            }


            console.log(
                "VALID FRAME:",
                frameNumber,
                bestResult.profile
            );


        } else {

            /*
             * Barcode exists, but the
             * visual signature differs.
             */

            differentCount++;


            console.warn(
                "DIFFERENT VIDEO FRAME:",
                frameNumber
            );
        }

    }


    /*
     * Reliability is calculated only
     * from cloud fingerprints.
     */

    const totalCloudFrames =
        cloudFingerprints.length;


    const reliability =
        totalCloudFrames > 0
            ? (
                validCount /
                totalCloudFrames
            ) * 100
            : 0;


    /*
     * Update video verification status.
     */

    videoVerificationStatus.textContent =
        "Video verification complete: " +
        "Valid: " +
        validCount +
        " | Different: " +
        differentCount +
        " | Missing: " +
        missingCount +
        " | Reliability: " +
        reliability.toFixed(2) +
        "%";


    /*
     * Update log.
     */

    addLog(
        "Video verification completed."
    );


    addLog(
        "Cloud frames checked: " +
        totalCloudFrames
    );


    addLog(
        "Valid frames: " +
        validCount
    );


    addLog(
        "Different frames: " +
        differentCount
    );


    addLog(
        "Missing video frames: " +
        missingCount
    );


    addLog(
        "Reliability: " +
        reliability.toFixed(2) +
        "%"
    );


    /*
     * Console results.
     */

    console.log(
        "===================================="
    );

    console.log(
        "VIDEO VERIFICATION RESULT"
    );

    console.log(
        "===================================="
    );


    console.log(
        "Cloud frames:",
        totalCloudFrames
    );


    console.log(
        "Video frames:",
        videoFingerprints.length
    );


    console.log(
        "Valid:",
        validCount
    );


    console.log(
        "Different:",
        differentCount
    );


    console.log(
        "Missing:",
        missingCount
    );


    console.log(
        "Strict matches:",
        strictMatches
    );


    console.log(
        "Normal matches:",
        normalMatches
    );


    console.log(
        "Lenient matches:",
        lenientMatches
    );


    console.log(
        "Reliability:",
        reliability.toFixed(2) +
        "%"
    );


    // ==========================================
    // UPDATE MAIN VERIFICATION SUMMARY
    // ==========================================

    if (cloudCountDisplay) {

        cloudCountDisplay.textContent =
            String(totalCloudFrames);
    }


    /*
     * Reference means the number of
     * cloud frames being verified.
     */

    if (referenceCountDisplay) {

        referenceCountDisplay.textContent =
            String(totalCloudFrames);
    }


    if (validCountDisplay) {

        validCountDisplay.textContent =
            String(validCount);
    }


    /*
     * IMPORTANT:
     * Video mismatch counter is
     * differentCount, NOT invalidCount.
     */

    if (invalidCountDisplay) {

        invalidCountDisplay.textContent =
            String(differentCount);
    }


    if (missingCountDisplay) {

        missingCountDisplay.textContent =
            String(missingCount);
    }


    /*
     * No extra cloud frames are counted
     * in this video comparison.
     */

    if (extraCountDisplay) {

        extraCountDisplay.textContent =
            "0";
    }


    if (reliabilityDisplay) {

        reliabilityDisplay.textContent =
            reliability.toFixed(2) +
            "%";
    }


    // ==========================================
    // UPDATE OVERALL INTEGRITY
    // ==========================================

    if (
        differentCount === 0 &&
        missingCount === 0 &&
        validCount === totalCloudFrames
    ) {

        if (integrityStatusDisplay) {

            integrityStatusDisplay.textContent =
                "INTEGRITY VERIFIED";

            integrityStatusDisplay.className =
                "status-badge success";
        }


        updateVerificationBanner(
            "verified"
        );


    } else {

        if (integrityStatusDisplay) {

            integrityStatusDisplay.textContent =
                "INTEGRITY ISSUE DETECTED";

            integrityStatusDisplay.className =
                "status-badge error";
        }


        updateVerificationBanner(
            "problem"
        );
    }


    console.log(
        "===================================="
    );

}

// ==========================================
// SEEK VIDEO TO SPECIFIC TIME
// ==========================================

function seekVideoToTime(time) {

    return new Promise(
        resolve => {

            const handleSeeked =
                () => {

                    videoPreview.removeEventListener(
                        "seeked",
                        handleSeeked
                    );

                    resolve();
                };


            videoPreview.addEventListener(
                "seeked",
                handleSeeked
            );


            videoPreview.currentTime =
                time;
        }
    );
}

if (verifyVideoButton) {

    verifyVideoButton.addEventListener(
        "click",
        verifyVideoAgainstCloud
    );

}