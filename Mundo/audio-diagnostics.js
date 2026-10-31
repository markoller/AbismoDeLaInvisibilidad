// DIAGNÓSTICO AUDIO v3. Se ejecuta antes de Three.js para mostrar también
// errores de arranque. No cambia el volumen ni crea otro AudioContext.
(() => {
    'use strict';

    const status = document.getElementById('audio-debug-status');
    const report = document.getElementById('audio-debug-report');
    const enable = document.getElementById('audio-debug-enable');
    const tone = document.getElementById('audio-debug-tone');
    const copy = document.getElementById('audio-debug-copy');
    const files = new Map(['Ambiente.wav', 'SpawnFotos.wav', 'DespawnFotos.wav']
        .map(name => [name, 'esperando inicialización']));
    const messages = [];
    const pending = new Map();
    let audio = null;
    let analyser = null;
    let samples = null;
    let attempts = 0;
    let gestures = 0;
    let lastGesture = 'ninguno';
    let lastResume = 'sin intentos';
    let toneRequest = 0;
    let activeTone = null;

    function describe(error) {
        return error?.message || String(error);
    }

    function log(message) {
        messages.push(`${new Date().toLocaleTimeString()} ${message}`);
        if (messages.length > 8) messages.shift();
        status.textContent = message;
        render();
    }

    function render() {
        const context = audio?.context;
        const lines = [
            'JavaScript diagnóstico: audio-v3',
            `Contexto: ${context?.state || 'no creado todavía'}`,
            `AudioSession: ${navigator.audioSession?.type || 'no disponible'}`,
            `Estado de sesión: ${navigator.audioSession?.state || 'no disponible'}`,
            `Reloj de audio: ${context ? context.currentTime.toFixed(2) + ' s' : '—'}`,
            `Frecuencia: ${context ? context.sampleRate + ' Hz' : '—'}`,
            `Gestos: ${gestures}; último: ${lastGesture}`,
            `resume(): ${attempts} intentos; ${pending.size} pendientes`,
            `Último resultado: ${lastResume}`,
        ];
        if (pending.size) {
            const elapsed = (performance.now() - Math.min(...pending.values())) / 1000;
            lines.push(`Esperando resume(): ${elapsed.toFixed(1)} s${elapsed > 3 ? ' (no respondió todavía)' : ''}`);
        }
        if (audio) {
            lines.push(`Volumen maestro: ${audio.listener.getMasterVolume().toFixed(2)}`);
            for (const [name, sound] of Object.entries(audio.sounds)) {
                lines.push(`${name}: buffer ${sound.buffer ? 'sí' : 'no'}, play ${sound.isPlaying ? 'sí' : 'no'}, volumen ${sound.getVolume().toFixed(2)}`);
            }
        }
        if (analyser) {
            analyser.getFloatTimeDomainData(samples);
            const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
            lines.push(`Señal interna: ${rms > 0 ? (20 * Math.log10(rms)).toFixed(1) + ' dBFS' : 'sin señal en esta muestra'}`);
        }
        lines.push('', 'Archivos:');
        for (const [name, state] of files) lines.push(`${name}: ${state}`);
        lines.push('', 'Eventos recientes:', ...messages,
            '', `Página: ${location.pathname}`, `Pestaña: ${document.visibilityState}`,
            `Navegador: ${navigator.userAgent}`,
            'La señal interna no confirma que se escuche por el parlante.');
        report.textContent = lines.join('\n');
    }

    window.AudioDiagnostics = {
        log,
        attach(session) {
            audio = session;
            enable.disabled = false;
            tone.disabled = false;
            try {
                analyser = session.context.createAnalyser();
                analyser.fftSize = 512;
                samples = new Float32Array(analyser.fftSize);
                session.listener.getInput().connect(analyser);
            } catch (error) {
                analyser = null;
                log(`No se pudo medir la señal: ${describe(error)}`);
            }
            session.context.addEventListener('statechange', () => {
                log(`Estado del contexto: ${session.context.state}`);
            });
            log(`Audio inicializado; contexto ${session.context.state}.`);
        },
        file(name, state) {
            files.set(name, state);
            render();
        },
        gesture(event) {
            gestures++;
            lastGesture = `${event?.type || 'botón'}; real ${event?.isTrusted ? 'sí' : 'no'}`;
            if (navigator.userActivation) {
                lastGesture += `; activación ${navigator.userActivation.isActive ? 'sí' : 'no'}`;
            }
            render();
        },
        beginResume() {
            const id = ++attempts;
            pending.set(id, performance.now());
            lastResume = `intento ${id} pendiente`;
            render();
            return error => {
                pending.delete(id);
                lastResume = error ? `error: ${describe(error)}` : `resuelto; contexto ${audio.context.state}`;
                log(`resume() ${id}: ${lastResume}`);
            };
        },
    };

    enable.addEventListener('click', event => audio?.unlock(event));
    tone.addEventListener('click', async event => {
        if (!audio || activeTone) return;
        const request = ++toneRequest;
        log('Prueba de tono: esperando habilitación del audio…');
        try {
            // unlock() llama resume() de forma síncrona dentro de este clic.
            await audio.unlock(event);
            if (request !== toneRequest) return;
            const context = audio.context;
            if (context.state !== 'running') {
                log(`No se programó el tono: contexto ${context.state}.`);
                return;
            }
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const now = context.currentTime;
            oscillator.frequency.value = 660;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
            gain.gain.setValueAtTime(0.12, now + 0.7);
            gain.gain.linearRampToValueAtTime(0, now + 0.8);
            oscillator.connect(gain);
            gain.connect(audio.listener.getInput());
            activeTone = oscillator;
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
                activeTone = null;
                log('Terminó el tono de prueba.');
            };
            oscillator.start(now);
            oscillator.stop(now + 0.8);
            log('Tono programado: 660 Hz, 0.8 segundos.');
        } catch (error) {
            activeTone = null;
            log(`Error al probar el tono: ${describe(error)}`);
        }
    });

    copy.disabled = false;
    copy.addEventListener('click', async () => {
        try {
            render();
            await navigator.clipboard.writeText(report.textContent);
            status.textContent = 'Diagnóstico copiado. Podés pegarlo en el chat.';
        } catch (error) {
            status.textContent = 'No se pudo copiar. Podés sacar una captura del panel.';
        }
    });

    window.addEventListener('error', event => {
        const resource = event.target?.src || event.target?.href;
        log(event.message ? `Error JS: ${event.message}` : `Falló un recurso: ${resource || 'sin detalle'}`);
    }, true);
    window.addEventListener('unhandledrejection', event => log(`Error no controlado: ${describe(event.reason)}`));
    document.addEventListener('visibilitychange', () => log(`Pestaña: ${document.visibilityState}`));
    navigator.audioSession?.addEventListener('statechange', () => {
        log(`AudioSession: ${navigator.audioSession.type}; estado: ${navigator.audioSession.state}.`);
    });
    setTimeout(() => {
        if (!audio) log('La escena todavía no inicializó el audio. Revisá los errores del panel.');
    }, 15000);
    setInterval(() => {
        if (document.getElementById('audio-debug').open && !document.hidden) render();
    }, 500);
    log('Diagnóstico v3 activo. Esperando la escena…');
})();
