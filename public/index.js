{
    const $introScreen = document.querySelector('#introScreen');
    const $introQuote = document.querySelector('#introQuote');
    const $introQrWrap = document.querySelector('#introQrWrap');
    const $mainUi = document.querySelector('#mainUi');
    const $remoteUrl = document.querySelector('#remoteUrl');
    const $qrStage = document.querySelector('.qr-stage');
    const $qrEnvelope = document.querySelector('.qr-envelope');
    const $letterDisplay = document.querySelector('#letterDisplay');
    const $sentenceSound = document.querySelector('#sentenceSound');
    const $typewriterSound = document.querySelector('#typewriterSound');
    const $bellSound = document.querySelector('#bellSound');
    const $crumpleSound = document.querySelector('#crumpleSound');
    const $typewriterCarriage = document.querySelector('.typewriter-carriage');
    const $typewriterWrap = document.querySelector('.typewriter-wrap');
    const $paperStack = document.querySelector('#paperStack');
    const $paperCrumpleFx = document.querySelector('#paperCrumpleFx');
    const $startScreen = document.querySelector('#startScreen');
    const $typingEyes = document.querySelector('#typingEyes');
    const introText = "Tell your people that you love them";

    let socket;
    let peer;
    let lastLength = 0;
    let introHidden = false;
    let sentenceSoundStarted = false;
    let pendingSentenceSound = false;
    let typingStopTimeout;
    let lastMessage = '';
    let activeHeart = null;
    let lastHeartSpawnAt = 0;
    let crumpleResetTimeout;
    let isDesktopCrumpling = false;
    let isLetterSealed = false;

    const CARRIAGE_START_SHIFT = 170;
    const CARRIAGE_END_SHIFT = -170;
    const MAX_CHARS_PER_LINE = 30;
    const HEART_VARIATION_COOLDOWN_MS = 2200;
    const HEART_HIDE_DELAY_MS = 1800;
    const HEART_FADE_OUT_MS = 1200;

    const revealMainUI = () => {
        if (introHidden) {
            return;
        }

        introHidden = true;
        $introScreen.classList.add('hidden');
        $mainUi.classList.add('ready');
    };

    const revealIntroQr = () => {
        $qrStage.classList.remove('envelope-open');
        $introScreen.classList.add('show-qr');
    };

    const openEnvelope = () => {
        $qrStage.classList.add('envelope-open');
    };

    const playSentenceSound = () => {
        if (sentenceSoundStarted) {
            return;
        }

        try {
            $sentenceSound.muted = false;
            $sentenceSound.volume = 1;
            $sentenceSound.currentTime = 0;

            const playPromise = $sentenceSound.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise
                    .then(() => {
                        sentenceSoundStarted = true;
                        pendingSentenceSound = false;
                    })
                    .catch(err => {
                        pendingSentenceSound = true;
                        console.log('Sentence play failed:', err);
                    });
            } else {
                sentenceSoundStarted = true;
                pendingSentenceSound = false;
            }
        } catch (err) {
            pendingSentenceSound = true;
            console.error('Error playing sentence:', err);
        }
    };

    const stopSentenceSound = () => {
        try {
            $sentenceSound.pause();
            $sentenceSound.currentTime = 0;
        } catch (err) {
            console.error('Error stopping sentence sound:', err);
        }
    };

    const setupStartScreen = () => {
        const handleStart = () => {
            $startScreen.classList.add('hidden');
            playSentenceSound();
            setTimeout(startIntroTyping, 2000);
        };

        $startScreen.addEventListener('pointerdown', handleStart, { once: true });
    };

    const startIntroTyping = () => {
        let currentIndex = 0;
        const minTypeDelay = 170;
        const maxTypeDelay = 320;

        playSentenceSound();

        const typeNextChar = () => {
            if (introHidden) {
                return;
            }

            if (currentIndex <= introText.length) {
                const visibleText = introText.slice(0, currentIndex);
                $introQuote.innerHTML = `${visibleText}<span class="type-caret"></span>`;
                currentIndex += 1;
                const nextDelay = Math.floor(Math.random() * (maxTypeDelay - minTypeDelay + 1)) + minTypeDelay;
                setTimeout(typeNextChar, nextDelay);
            } else {
                $introQuote.textContent = introText;
                stopSentenceSound();
                setTimeout(revealIntroQr, 200);
            }
        };

        typeNextChar();
    };

    const playTypewriterSound = () => {
        try {
            const sound = $typewriterSound.cloneNode();
            sound.play().catch(err => console.log('Audio play failed:', err));
        } catch (err) {
            console.error('Error playing sound:', err);
        }
    };

    const playBellSound = () => {
        try {
            const sound = $bellSound.cloneNode();
            sound.play().catch(err => console.log('Bell play failed:', err));
        } catch (err) {
            console.error('Error playing bell:', err);
        }
    };

    const playCrumpleSound = () => {
        try {
            const sound = $crumpleSound.cloneNode();
            sound.play().catch(err => console.log('Crumple play failed:', err));
        } catch (err) {
            console.error('Error playing crumple:', err);
        }
    };

    const triggerCarriageReturn = () => {
        $typewriterCarriage.classList.remove('carriage-return');

        requestAnimationFrame(() => {
            $typewriterCarriage.classList.add('carriage-return');
        });

        setCarriageShift(CARRIAGE_START_SHIFT);

        setTimeout(() => {
            $typewriterCarriage.classList.remove('carriage-return');
        }, 320);
    };

    const setCarriageShift = shift => {
        $typewriterCarriage.style.setProperty('--carriage-shift', `${shift}px`);
        $letterDisplay.style.setProperty('--paper-shift', `${shift}px`);
        $paperCrumpleFx.style.setProperty('--paper-shift', `${shift}px`);
    };

    const getCurrentColumn = message => {
        const lines = message.split('\n');
        return lines[lines.length - 1].length;
    };

    const getLineCount = message => {
        return message.split('\n').length;
    };

    const updateCarriageForMessage = message => {
        const currentColumn = getCurrentColumn(message);
        const progress = Math.min(currentColumn / MAX_CHARS_PER_LINE, 1);
        const shift = CARRIAGE_START_SHIFT + (CARRIAGE_END_SHIFT - CARRIAGE_START_SHIFT) * progress;
        setCarriageShift(shift);
    };

    const triggerDesktopCrumple = () => {
        $paperStack.classList.remove('letter-sealed');
        isLetterSealed = false;
        isDesktopCrumpling = true;
        playCrumpleSound();
        $paperStack.classList.remove('paper-crumple-active');

        requestAnimationFrame(() => {
            $paperStack.classList.add('paper-crumple-active');
        });

        clearTimeout(crumpleResetTimeout);
        crumpleResetTimeout = setTimeout(() => {
            $paperStack.classList.remove('paper-crumple-active');
            $letterDisplay.value = '';
            $letterDisplay.style.opacity = '';
            lastMessage = '';
            lastLength = 0;
            isDesktopCrumpling = false;
            $typewriterWrap.classList.remove('typewriter-hidden-temp');
            setCarriageShift(CARRIAGE_START_SHIFT);
        }, 760);
    };

    const hideTypewriter = () => {
        $typewriterWrap.classList.add('typewriter-hidden-temp');
    };

    const triggerLetterSeal = () => {
        if (isDesktopCrumpling) {
            return;
        }

        isLetterSealed = true;
        $paperStack.classList.remove('letter-sealed');

        requestAnimationFrame(() => {
            $paperStack.classList.add('letter-sealed');
        });
    };

    const clearLetterSeal = () => {
        if (!isLetterSealed && !$paperStack.classList.contains('letter-sealed')) {
            return;
        }

        isLetterSealed = false;
        $paperStack.classList.remove('letter-sealed');
    };

    const spawnTypingEye = () => {
        const heart = document.createElement('span');
        heart.className = 'typing-heart';
        heart.textContent = '♥';

        const size = Math.floor(Math.random() * 28) + 112;
        const horizontalMargin = 24;
        const maxX = Math.max(0, window.innerWidth - size - horizontalMargin);
        const maxY = Math.max(0, window.innerHeight - size);
        const sideZoneWidth = Math.max(Math.floor(window.innerWidth * 0.32), size + horizontalMargin);

        const leftZoneMin = horizontalMargin;
        const leftZoneMax = Math.max(leftZoneMin, Math.min(sideZoneWidth, maxX));

        const rightZoneMin = Math.max(leftZoneMax, window.innerWidth - sideZoneWidth - size - horizontalMargin);
        const rightZoneMax = Math.max(rightZoneMin, maxX);

        const useLeftSide = Math.random() < 0.5;
        const x = useLeftSide
            ? leftZoneMin + Math.random() * (leftZoneMax - leftZoneMin)
            : rightZoneMin + Math.random() * (rightZoneMax - rightZoneMin);
        const y = Math.random() * maxY;
        const rotation = (Math.random() - 0.5) * 12;

        heart.style.fontSize = `${size}px`;
        heart.style.left = `${x}px`;
        heart.style.top = `${y}px`;
        heart.style.setProperty('--heart-rotation', `${rotation}deg`);

        return heart;
    };

    const showTypingEyes = () => {
        const now = Date.now();
        const shouldSpawnNewHeart = !activeHeart || (now - lastHeartSpawnAt) > HEART_VARIATION_COOLDOWN_MS;

        if (shouldSpawnNewHeart) {
            activeHeart = spawnTypingEye();
            lastHeartSpawnAt = now;
            $typingEyes.textContent = '';
            $typingEyes.appendChild(activeHeart);
        }

        activeHeart.classList.remove('is-fading');
        activeHeart.classList.remove('is-active');

        requestAnimationFrame(() => {
            if (activeHeart) {
                activeHeart.classList.add('is-active');
            }
        });

        clearTimeout(typingStopTimeout);
        typingStopTimeout = setTimeout(() => {
            if (!activeHeart) {
                return;
            }

            activeHeart.classList.remove('is-active');
            activeHeart.classList.add('is-fading');

            setTimeout(() => {
                if (activeHeart && activeHeart.classList.contains('is-fading')) {
                    $typingEyes.textContent = '';
                    activeHeart = null;
                }
            }, HEART_FADE_OUT_MS);
        }, HEART_HIDE_DELAY_MS);
    };

    const init = () => {
        setupStartScreen();
        $qrEnvelope.addEventListener('pointerdown', openEnvelope, { once: true });

        socket = io.connect('/');
        socket.on('connect', () => {
            console.log(`Desktop connected: ${socket.id}`);
            const url = `${window.location.origin}/remote.html?targetSocketId=${socket.id}`;

            $remoteUrl.textContent = url;
            $remoteUrl.setAttribute('href', url);

            try {
                const typeNumber = 0;
                const errorCorrectionLevel = 'L';
                const qr = qrcode(typeNumber, errorCorrectionLevel);
                qr.addData(url);
                qr.make();
                $remoteUrl.innerHTML = qr.createImgTag();
            } catch (err) {
                console.error('QR generation failed:', err);
                $remoteUrl.textContent = url;
            }
        });

        socket.on('signal', (myId, signal, peerId) => {
            console.log(`Received signal from ${peerId}`);

            if (signal.type === 'offer') {
                createPeer(false, peerId);
            }

            if (peer) {
                peer.signal(signal);
            }
        });
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

        peer.on('data', data => {
            const message = data.toString();

            if (message === '__BELL__') {
                playBellSound();
                triggerCarriageReturn();
                return;
            }

            if (message === '__CRUMPLE__') {
                triggerDesktopCrumple();
                return;
            }

            if (message === '__STICKER__') {
                return;
            }

            if (message === '__DONE__') {
                const hasLetterContent = (lastMessage || $letterDisplay.value || '').trim().length > 0;
                if (!hasLetterContent) {
                    return;
                }

                hideTypewriter();
                triggerLetterSeal();
                return;
            }

            if (isDesktopCrumpling && message === '') {
                return;
            }

            if (isLetterSealed && message !== lastMessage) {
                clearLetterSeal();
            }

            console.log('Received letter data:', message);

            if (message.length > lastLength) {
                playTypewriterSound();
            }

            const movedToNewLine = getLineCount(message) > getLineCount(lastMessage);
            if (movedToNewLine) {
                triggerCarriageReturn();
            }

            if (message !== lastMessage) {
                showTypingEyes();
            }
            updateCarriageForMessage(message);

            lastMessage = message;
            lastLength = message.length;
            $letterDisplay.value = message;
        });

        peer.on('connect', () => {
            console.log('WebRTC connection established!');
            $letterDisplay.placeholder = 'Start typing on your phone...';
            setCarriageShift(CARRIAGE_START_SHIFT);
            revealMainUI();
        });

        peer.on('error', err => {
            console.error('Peer error:', err);
        });
    };

    init();
}
