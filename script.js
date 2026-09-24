// Variáveis de estado
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let isAudioActive = false;
let animationFrameId = null;

let ambientNoiseFloor = 5;
let calibrationSamples = [];
let isCalibrating = false;

// Elementos HTML
const btnToggleMic = document.getElementById('btnToggleMic');
const btnText = document.getElementById('btnText');
const micIcon = document.getElementById('micIcon');
const btnCalibrate = document.getElementById('btnCalibrate');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const alertBox = document.getElementById('alertBox');
const alertEmoji = document.getElementById('alertEmoji');
const alertTitle = document.getElementById('alertTitle');
const alertDescription = document.getElementById('alertDescription');

const progressBar = document.getElementById('progressBar');
const volumeNumber = document.getElementById('volumeNumber');
const noiseFloorText = document.getElementById('noiseFloorText');

const canvas = document.getElementById('waveformCanvas');
const canvasCtx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

async function toggleMicrophone() {
    if (isAudioActive) {
        stopAudioProcessing();
    } else {
        await startAudioProcessing();
    }
}

async function startAudioProcessing() {
    try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, 
            video: false 
        });

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(microphoneStream);
        source.connect(analyser);

        isAudioActive = true;
        btnText.textContent = "Desativar Microfone";
        micIcon.textContent = "🛑";
        btnToggleMic.classList.replace('bg-indigo-600', 'bg-rose-600');
        
        statusDot.className = "inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse";
        statusText.textContent = "Microfone ativo. Captando intensidade em tempo real.";

        btnCalibrate.disabled = false;
        btnCalibrate.classList.replace('bg-slate-200', 'bg-slate-700');
        btnCalibrate.classList.replace('text-slate-400', 'text-white');
        btnCalibrate.classList.replace('cursor-not-allowed', 'cursor-pointer');

        triggerCalibration();
        processAudio();

    } catch (error) {
        console.error("Erro ao acessar microfone:", error);
        statusText.textContent = "Permissão negada ou microfone indisponível.";
        statusDot.className = "inline-block w-2.5 h-2.5 rounded-full bg-rose-500";
    }
}

function stopAudioProcessing() {
    if (microphoneStream) microphoneStream.getTracks().forEach(track => track.stop());
    if (audioContext) audioContext.close();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    isAudioActive = false;
    btnText.textContent = "Ativar Microfone";
    micIcon.textContent = "🎤";
    btnToggleMic.classList.replace('bg-rose-600', 'bg-indigo-600');

    statusDot.className = "inline-block w-2.5 h-2.5 rounded-full bg-slate-400";
    statusText.textContent = "Microfone desligado. Clique no botão acima para iniciar.";

    btnCalibrate.disabled = true;
    btnCalibrate.className = "w-full sm:w-auto px-6 py-4 bg-slate-200 text-slate-400 font-semibold text-base rounded-xl cursor-not-allowed transition-all flex items-center justify-center gap-2";

    updateVisualAlert('standby', 0);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

function triggerCalibration() {
    isCalibrating = true;
    calibrationSamples = [];
    noiseFloorText.textContent = "Calibrando ruído ambiente...";
    
    setTimeout(() => {
        if (calibrationSamples.length > 0) {
            const avg = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
            ambientNoiseFloor = Math.max(Math.round(avg), 2);
            noiseFloorText.textContent = `Piso de ruído: ${ambientNoiseFloor}% (Calibrado)`;
        }
        isCalibrating = false;
    }, 2000);
}

function recalibrateNoise() {
    if (isAudioActive) triggerCalibration();
}

function processAudio() {
    if (!isAudioActive) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
        const normalizedSample = (dataArray[i] - 128) / 128;
        sumSquares += normalizedSample * normalizedSample;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    let rawVolume = Math.min(Math.round(rms * 220), 100);

    if (isCalibrating) calibrationSamples.push(rawVolume);

    let adjustedVolume = Math.max(0, rawVolume);

    progressBar.style.width = `${adjustedVolume}%`;
    volumeNumber.textContent = `${adjustedVolume} / 100`;

    let state = 'low';
    const moderateThreshold = Math.max(ambientNoiseFloor + 12, 25);
    const highThreshold = Math.max(ambientNoiseFloor + 35, 60);

    if (adjustedVolume >= highThreshold) state = 'high';
    else if (adjustedVolume >= moderateThreshold) state = 'moderate';

    updateVisualAlert(state, adjustedVolume);
    drawWaveform(dataArray, bufferLength);

    animationFrameId = requestAnimationFrame(processAudio);
}

function drawWaveform(dataArray, bufferLength) {
    canvasCtx.fillStyle = '#0f172a';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 3 * window.devicePixelRatio;
    canvasCtx.strokeStyle = '#38bdf8';
    canvasCtx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);

        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

function updateVisualAlert(state, volume) {
    alertBox.classList.remove('status-low', 'status-moderate', 'status-high', 'animate-flashRed', 'bg-slate-100', 'border-slate-300');
    progressBar.classList.remove('bg-emerald-500', 'bg-amber-500', 'bg-rose-600');

    if (state === 'standby') {
        alertBox.classList.add('bg-slate-100', 'border-slate-300');
        alertEmoji.textContent = '😴';
        alertTitle.textContent = 'Aguardando Sinal';
        alertTitle.className = 'text-3xl sm:text-5xl font-black uppercase tracking-wide text-slate-700';
        alertDescription.textContent = 'Ligue o microfone para que o sistema comece a monitorar o barulho do ambiente.';
        progressBar.style.width = '0%';
        progressBar.classList.add('bg-emerald-500');
        volumeNumber.textContent = '0 / 100';
        return;
    }

    if (state === 'low') {
        alertBox.classList.add('status-low');
        progressBar.classList.add('bg-emerald-500');
        alertEmoji.textContent = '😊';
        alertTitle.textContent = '🟢 BAIXO RUÍDO';
        alertTitle.className = 'text-3xl sm:text-5xl font-black uppercase tracking-wide text-emerald-800';
        alertDescription.textContent = 'Ambiente tranquilo. O nível de ruído atual é baixo e seguro.';
    } else if (state === 'moderate') {
        alertBox.classList.add('status-moderate');
        progressBar.classList.add('bg-amber-500');
        alertEmoji.textContent = '😟';
        alertTitle.textContent = '🟡 RUÍDO MODERADO';
        alertTitle.className = 'text-3xl sm:text-5xl font-black uppercase tracking-wide text-amber-900';
        alertDescription.textContent = 'Atenção! Existe um nível moderado de som ou conversas no ambiente.';
    } else if (state === 'high') {
        alertBox.classList.add('status-high', 'animate-flashRed');
        progressBar.classList.add('bg-rose-600');
        alertEmoji.textContent = '😠';
        alertTitle.textContent = '🔴 MUITO BARULHO!';
        alertTitle.className = 'text-3xl sm:text-5xl font-black uppercase tracking-wide text-rose-900';
        alertDescription.textContent = 'ALERTA: Som alto ou ruído intenso detectado! Excelente sinalizador visual para salas de aula ou locais de trabalho.';
    }
}