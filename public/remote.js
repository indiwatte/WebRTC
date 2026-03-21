{
    const $letterInput = document.getElementById('letterInput');
    const $status = document.getElementById('status');
    const $typingSurface = document.getElementById('typingSurface');
    const $lineGuide = document.getElementById('lineGuide');
    const $paperSheet = document.getElementById('paperSheet');
    const $trashBin = document.getElementById('trashBin');
    const $doneBtn = document.getElementById('doneBtn');
    const $sealActions = document.getElementById('sealActions');
    const $sealMessage = document.querySelector('.seal-message');
    const $saveLetterBtn = document.getElementById('saveLetterBtn');
    const $stampSound = document.getElementById('stampSound');

    let socket;
    let peer;
    let targetSocketId;
    let lastSentValue = '';
    let skipNextInputBell = false;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let lineGuideTimeout;
    let lastMotionTrigger = 0;
    let motionSensor;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let isPaperDragging = false;
    let crumpleTimeout;
    let isLetterSealed = false;

    const MAX_CHARS_PER_LINE = 30;
    const SWIPE_THRESHOLD = 55;
    const SWIPE_VERTICAL_TOLERANCE = 45;
    const MOTION_THRESHOLD = 15;
    const MOTION_DEBOUNCE_MS = 800;
    const GYROSCOPE_TILT_THRESHOLD = 1.8;
    const GYROSCOPE_DEBOUNCE_MS = 600;

    const getUrlParameter = name => {
        name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
        const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
        const results = regex.exec(location.search);
        return results === null ? false : decodeURIComponent(results[1].replace(/\+/g, ' '));
    };

    const init = () => {
        targetSocketId = getUrlParameter('targetSocketId');

        if (!targetSocketId) {
            $status.textContent = 'Error: No target ID provided in URL';
            return;
        }

        console.log('Target Socket ID:', targetSocketId);
        $status.textContent = 'Connecting to desktop...';

        socket = io.connect('/');
        socket.on('connect', () => {
            console.log(`Phone connected: ${socket.id}`);
            $status.textContent = 'Creating connection...';
            createPeer(true, targetSocketId);
        });

        socket.on('signal', (myId, signal, peerId) => {
            console.log(`Received signal from ${peerId}`);
            if (peer) {
                peer.signal(signal);
            }
        });
    };

    const focusHiddenInput = () => {
        $letterInput.focus();
    };

    const getCurrentLineLength = value => {
        const lines = value.split('\n');
        return lines[lines.length - 1].length;
    };

    const exceedsLineLimit = value => {
        return value.split('\n').some(line => line.length > MAX_CHARS_PER_LINE);
    };

    const isCharacterInsertionKey = event => {
        return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    };

    const showLineGuide = (message, isActive = true) => {
        clearTimeout(lineGuideTimeout);
        $lineGuide.textContent = message;
        $lineGuide.classList.toggle('active', isActive);

        if (isActive) {
            lineGuideTimeout = setTimeout(() => {
                $lineGuide.textContent = 'Swipe left to start a new line.';
                $lineGuide.classList.remove('active');
            }, 1800);
        }
    };

    const setSaveButtonVisible = isVisible => {
        $saveLetterBtn.hidden = !isVisible;
        $sealActions.hidden = !isVisible;
        if (isVisible) {
            $sealMessage.textContent = 'Your letter is sealed and stamped.';
        }
    };

    const createLetterPdfBlob = letterContent => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const margin = 52;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxTextWidth = pageWidth - margin * 2;
        const lineHeight = 20;
        const maxContentHeight = pageHeight - margin * 2;
        const maxLinesPerPage = Math.max(1, Math.floor(maxContentHeight / lineHeight));

        doc.setFont('courier', 'normal');
        doc.setFontSize(14);
        doc.text('Dear you...', margin, margin);

        const normalizedContent = letterContent.replace(/\r\n/g, '\n').trimEnd();
        const letterLines = normalizedContent.length
            ? doc.splitTextToSize(normalizedContent, maxTextWidth)
            : ['(empty letter)'];

        let cursorY = margin + 34;

        for (let i = 0; i < letterLines.length; i += 1) {
            if ((i > 0 && i % maxLinesPerPage === 0) || cursorY > pageHeight - margin) {
                doc.addPage();
                cursorY = margin;
            }

            doc.text(letterLines[i], margin, cursorY);
            cursorY += lineHeight;
        }

        return doc.output('blob');
    };

    const timestampForFileName = () => {
        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    };

    const downloadBlob = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    };

    const playStampSound = () => {
        try {
            const sound = $stampSound.cloneNode();
            sound.play().catch(err => console.log('Stamp play failed:', err));
        } catch (err) {
            console.error('Error playing stamp sound:', err);
        }
    };

    const $motionBtn = document.getElementById('motionBtn');
    const $motionStatus = document.getElementById('motionStatus');
    const $container = document.querySelector('.container');

    const resetPaperPosition = () => {
        $paperSheet.style.removeProperty('--paper-x');
        $paperSheet.style.removeProperty('--paper-y');
        $paperSheet.style.transform = 'translate(-50%, -50%)';
        $paperSheet.classList.remove('dragging');
        $trashBin.classList.remove('active');
    };

    const updatePaperTransform = () => {
        $paperSheet.style.setProperty('--paper-x', `${dragOffsetX - 50}%`);
        $paperSheet.style.setProperty('--paper-y', `${dragOffsetY - 50}%`);
        $paperSheet.style.transform = `translate(${dragOffsetX - 50}%, ${dragOffsetY - 50}%)`;
    };

    const isPaperOverTrash = () => {
        const paperRect = $paperSheet.getBoundingClientRect();
        const trashRect = $trashBin.getBoundingClientRect();

        return !(
            paperRect.right < trashRect.left ||
            paperRect.left > trashRect.right ||
            paperRect.bottom < trashRect.top ||
            paperRect.top > trashRect.bottom
        );
    };

    const replaceWithNewPaper = () => {
        $letterInput.value = '';
        lastSentValue = '';
        isLetterSealed = false;
        setSaveButtonVisible(false);

        if (peer && peer.connected) {
            peer.send('__CRUMPLE__');
            peer.send('');
        }

        showLineGuide('New empty paper ready.', false);
        clearTimeout(crumpleTimeout);
        crumpleTimeout = setTimeout(() => {
            $paperSheet.classList.remove('crumpling');
            $paperSheet.style.opacity = '';
            resetPaperPosition();
        }, 0);
    };

    const crumplePaper = () => {
        $paperSheet.classList.remove('dragging');
        $trashBin.classList.remove('active');
        $paperSheet.classList.add('crumpling');
        replaceWithNewPaper();
    };

    const startPaperDrag = event => {
        if ($paperSheet.classList.contains('crumpling')) return;
        isPaperDragging = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragOffsetX = 50;
        dragOffsetY = 50;
        $paperSheet.classList.add('dragging');
        $paperSheet.setPointerCapture(event.pointerId);
    };

    const movePaperDrag = event => {
        if (!isPaperDragging) return;

        const dx = event.clientX - dragStartX;
        const dy = event.clientY - dragStartY;
        const zoneWidth = $container.clientWidth;
        const zoneHeight = 180;

        dragOffsetX = Math.max(5, Math.min(95, 50 + (dx / zoneWidth) * 100));
        dragOffsetY = Math.max(8, Math.min(92, 50 + (dy / zoneHeight) * 100));
        updatePaperTransform();
        $trashBin.classList.toggle('active', isPaperOverTrash());
    };

    const endPaperDrag = event => {
        if (!isPaperDragging) return;
        isPaperDragging = false;
        $paperSheet.releasePointerCapture(event.pointerId);

        if (isPaperOverTrash()) {
            crumplePaper();
            return;
        }

        resetPaperPosition();
    };

    const flashContainer = () => {
        $container.classList.add('carriage-flash');
        setTimeout(() => $container.classList.remove('carriage-flash'), 350);
    };

    const triggerMotionFromX = xAxisAcceleration => {
        if (xAxisAcceleration === null || xAxisAcceleration === undefined) return;
        const now = Date.now();
        if (now - lastMotionTrigger < MOTION_DEBOUNCE_MS) return;

        if (xAxisAcceleration < -MOTION_THRESHOLD) {
            lastMotionTrigger = now;
            triggerCarriageReturn();
            flashContainer();
        }
    };

    const triggerTiltToDone = gyroscopeX => {
        if (gyroscopeX === null || gyroscopeX === undefined) return;
        const now = Date.now();
        if (now - lastMotionTrigger < GYROSCOPE_DEBOUNCE_MS) return;

        if (gyroscopeX > GYROSCOPE_TILT_THRESHOLD) {
            lastMotionTrigger = now;
            const letterContent = $letterInput.value || '';
            if (!letterContent.trim()) {
                showLineGuide('Write your letter before sealing it.', true);
                return;
            }
            playStampSound();
            if (peer && peer.connected) {
                peer.send('__DONE__');
            }
            isLetterSealed = true;
            setSaveButtonVisible(true);
            showLineGuide('Letter sealed by tilt!', false);
        }
    };

    const handleDeviceMotion = event => {
        const acc = event.acceleration || event.accelerationIncludingGravity;
        if (!acc) return;
        triggerMotionFromX(acc.x);
    };

    const startAccelerometer = () => {
        if (!('Accelerometer' in window)) {
            return false;
        }

        try {
            const acl = new Accelerometer({ frequency: 60 });

            acl.addEventListener('reading', () => {
                triggerMotionFromX(acl.x);
            });

            acl.addEventListener('error', event => {
                console.error('Accelerometer error:', event.error);
                $motionStatus.textContent = 'accelerometer error';
            });

            acl.start();
            motionSensor = acl;
            $motionBtn.style.display = 'none';
            $motionStatus.textContent = '✦ accelerometer active';
            return true;
        } catch (err) {
            console.error('Accelerometer start failed:', err);
            return false;
        }
    };

    const startGyroscope = () => {
        if (!('Gyroscope' in window)) {
            return false;
        }

        try {
            const gyro = new Gyroscope({ frequency: 60 });

            gyro.addEventListener('reading', () => {
                triggerTiltToDone(gyro.x);
            });

            gyro.addEventListener('error', event => {
                console.error('Gyroscope error:', event.error);
                $motionStatus.textContent = 'gyroscope error';
            });

            gyro.start();
            motionSensor = gyro;
            $motionBtn.style.display = 'none';
            $motionStatus.textContent = '✦ gyroscope active (tilt to seal)';
            return true;
        } catch (err) {
            console.error('Gyroscope start failed:', err);
            return false;
        }
    };

    const enableMotion = async () => {
        if (motionSensor) return;

        if (startGyroscope()) {
            return;
        }

        if (startAccelerometer()) {
            return;
        }

        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    $motionBtn.style.display = 'none';
                    $motionStatus.textContent = '✦ motion active (fallback)';
                } else {
                    $motionStatus.textContent = 'permission denied';
                }
            } catch (err) {
                console.error('Motion permission error:', err);
                $motionStatus.textContent = 'not supported';
            }
        } else {
            window.addEventListener('devicemotion', handleDeviceMotion);
            $motionBtn.style.display = 'none';
            $motionStatus.textContent = '✦ motion active (fallback)';
        }
    };

    $motionBtn.addEventListener('click', enableMotion);

    const triggerCarriageReturn = () => {
        if ($letterInput.value.length === 0 || $letterInput.value.endsWith('\n')) {
            return;
        }

        const nextValue = `${$letterInput.value}\n`;
        $letterInput.value = nextValue;
        skipNextInputBell = true;

        if (peer && peer.connected) {
            peer.send('__BELL__');
            peer.send(nextValue);
        }

        lastSentValue = nextValue;
        showLineGuide('Carriage returned. Keep typing.', false);
    };

    const createPeer = (initiator, peerId) => {
        console.log(`Creating peer connection (initiator: ${initiator})`);

        peer = new SimplePeer({
            initiator,
            trickle: false
        });

        peer.on('signal', data => {
            console.log('Sending signal');
            socket.emit('signal', peerId, data);
        });

        peer.on('connect', () => {
            console.log('WebRTC connection established!');
            $status.textContent = 'Connected to desktop!';
            $status.classList.add('connected');
            focusHiddenInput();
        });

        peer.on('error', err => {
            console.error('Peer error:', err);
            $status.textContent = 'Connection error: ' + err.message;
        });
    };

    $letterInput.addEventListener('input', e => {
        if (isLetterSealed) {
            isLetterSealed = false;
            setSaveButtonVisible(false);
        }

        if (peer && peer.connected) {
            const letterContent = e.target.value;

            if (exceedsLineLimit(letterContent)) {
                e.target.value = lastSentValue;
                showLineGuide('Line full. Swipe left to start a new line.');
                return;
            }

            const insertedLineBreak = e.inputType === 'insertLineBreak';
            const newlineAdded = (letterContent.match(/\n/g) || []).length > (lastSentValue.match(/\n/g) || []).length;

            if (!skipNextInputBell && (insertedLineBreak || newlineAdded)) {
                peer.send('__BELL__');
            }

            peer.send(letterContent);
            lastSentValue = letterContent;
            skipNextInputBell = false;

            if (getCurrentLineLength(letterContent) === MAX_CHARS_PER_LINE) {
                showLineGuide('Line full. Swipe left to start a new line.');
            }
        } else {
            console.log('Peer not connected yet');
        }
    });

    $letterInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            triggerCarriageReturn();
            return;
        }

        const currentLineLength = getCurrentLineLength($letterInput.value);
        const lineIsFull = currentLineLength >= MAX_CHARS_PER_LINE && !$letterInput.value.endsWith('\n');

        if (lineIsFull && isCharacterInsertionKey(e)) {
            e.preventDefault();
            showLineGuide('Line full. Swipe left to start a new line.');
            return;
        }
    });

    document.querySelector('.heart-icon').addEventListener('click', () => {
        if (peer && peer.connected) {
            peer.send('__STICKER__');
            console.log('Sticker sent!');
        } else {
            console.log('Peer not connected yet');
        }
    });

    $doneBtn.addEventListener('click', () => {
        const letterContent = $letterInput.value || '';
        if (!letterContent.trim()) {
            showLineGuide('Write your letter before sealing it.', true);
            return;
        }

        playStampSound();

        if (peer && peer.connected) {
            peer.send('__DONE__');
        } else {
            console.log('Peer not connected yet');
        }

        isLetterSealed = true;
        setSaveButtonVisible(true);
        showLineGuide('Letter sealed.', false);
    });

    $saveLetterBtn.addEventListener('click', () => {
        const letterContent = $letterInput.value || '';
        if (!letterContent.trim()) {
            showLineGuide('No letter text to save yet.', true);
            return;
        }

        const fileName = `letter-${timestampForFileName()}.pdf`;
        const pdfBlob = createLetterPdfBlob(letterContent);
        downloadBlob(pdfBlob, fileName);

        $saveLetterBtn.hidden = true;
        $sealActions.hidden = false;
        $sealMessage.textContent = 'PDF saved to your device.';

        showLineGuide('PDF saved to your device.', false);
    });

    $typingSurface.addEventListener('click', focusHiddenInput);
    $typingSurface.addEventListener('touchstart', focusHiddenInput, { passive: true });

    $paperSheet.addEventListener('pointerdown', event => {
        event.preventDefault();
        startPaperDrag(event);
    });

    $paperSheet.addEventListener('pointermove', event => {
        if (!isPaperDragging) return;
        event.preventDefault();
        movePaperDrag(event);
    });

    $paperSheet.addEventListener('pointerup', endPaperDrag);
    $paperSheet.addEventListener('pointercancel', () => {
        if (!isPaperDragging) return;
        isPaperDragging = false;
        resetPaperPosition();
    });

    $paperSheet.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            crumplePaper();
        }
    });

    document.addEventListener('touchstart', e => {
        if (!e.touches || e.touches.length === 0) return;
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - swipeStartX;
        const deltaY = Math.abs(touch.clientY - swipeStartY);

        if (deltaX <= -SWIPE_THRESHOLD && deltaY <= SWIPE_VERTICAL_TOLERANCE) {
            triggerCarriageReturn();
            flashContainer();
        }
    }, { passive: true });

    $typingSurface.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            focusHiddenInput();
        }
    });

    init();
}
