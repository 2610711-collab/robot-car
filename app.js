// 통신 인프라 공유 변수
let serialPort = null;
let serialWriter = null;
let serialReader = null;
let isConnected = false;
let currentMode = 'usb'; // 'usb' 또는 'bt'

// UI 도큐먼트 엘리먼트 래핑
const connStatus = document.getElementById('conn-status');
const btnConnect = document.getElementById('btn-connect');
const terminalLog = document.getElementById('terminal-log');
const cmdInput = document.getElementById('cmd-input');

// 1. 입출력 통신 모드 셀렉터 스위칭
document.getElementById('mode-usb').addEventListener('click', (e) => switchMode('usb', e.target));
document.getElementById('mode-bt').addEventListener('click', (e) => switchMode('bt', e.target));

function switchMode(mode, targetElement) {
    if (isConnected) {
        log("경고: 활성화된 연결이 있습니다. 장치 연결 해제 후 모드를 변경해 주세요.", "err");
        return;
    }
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    targetElement.classList.add('active');
    log(`통신 모드가 [${mode.toUpperCase()}] 조종 모드로 변경되었습니다.`, "sys");
}

// 2. Web Serial API 비동기 커넥션 핸들러
btnConnect.addEventListener('click', async () => {
    if (isConnected) {
        await disconnectDevice();
        return;
    }

    try {
        const filters = currentMode === 'bt' ? [] : []; // HC-05 및 USB 일반 필터링 바인딩 스코프
        
        // 포트 요청 수락 파트
        serialPort = await navigator.serial.requestPort({ filters });
        
        log("포트를 오픈하는 중입니다... (BaudRate: 9600)", "sys");
        await serialPort.open({ baudRate: 9600 });
        
        serialWriter = serialPort.writable.getWriter();
        isConnected = true;
        
        connStatus.textContent = currentMode === 'usb' ? "USB CONNECTED" : "BT CONNECTED";
        connStatus.className = "conn-indicator connected";
        btnConnect.textContent = "연결 해제 (DISCONNECT)";
        btnConnect.style.background = "var(--accent-red)";
        btnConnect.style.color = "#fff";
        
        log(`성공: 아두이노 [${currentMode.toUpperCase()}] 포트에 정상 결속되었습니다.`, "sys");
        
        // 백그라운드 RX 리드 루프 구동
        readLoop();
        
    } catch (error) {
        handleConnectionError(error);
    }
});

function handleConnectionError(error) {
    console.error(error);
    if (error.name === 'NotFoundError') {
        log("연결 실패: 장치 선택이 취소되었습니다.", "err");
    } else if (error.name === 'InvalidStateError') {
        log("오류: 해당 포트가 이미 다른 프로세스에 의해 사용 중입니다.", "err");
        log("💡 조치방법: Arduino IDE의 시리얼 모니터 창을 완전히 닫았는지 확인하세요.", "sys");
    } else {
        log(`연결 차단 에러: ${error.message}`, "err");
    }
    resetConnectionState();
}

async function disconnectDevice() {
    log("안전 정지 프로토콜: 포트 해제 전 전원 차단 명령(S, Z)을 송출합니다.", "sys");
    // 모든 모터와 서보 즉시 강제 종료 신호 연사
    await sendCommand("S");
    await sendCommand("Z");
    
    resetConnectionState();
    log("장치 연결이 정상 해제되었습니다.", "sys");
}

function resetConnectionState() {
    isConnected = false;
    if (serialWriter) { serialWriter.releaseLock(); serialWriter = null; }
    if (serialReader) { serialReader.cancel(); serialReader = null; }
    if (serialPort) { serialPort.close(); serialPort = null; }
    
    connStatus.textContent = "DISCONNECTED";
    connStatus.className = "conn-indicator";
    btnConnect.textContent = "장치 연결 (CONNECT)";
    btnConnect.style.background = "var(--text-primary)";
    btnConnect.style.color = "var(--bg-color)";
}

// 3. 시리얼 데이터 스트림 송수신 엔진
async function sendCommand(cmd) {
    if (!isConnected || !serialWriter) {
        log(`전송 실패 [명령어 무시됨]: ${cmd} (이유: 장치 미연결)`, "err");
        return;
    }
    try {
        const encoder = new TextEncoder();
        // 요구사항 명시 프로토콜: 줄바꿈 문자('\n') 강제 보정 후 전송
        const dataWithNewLine = cmd + "\n";
        await serialWriter.write(encoder.encode(dataWithNewLine));
        log(`TX ➔ ${cmd}`, "tx");
    } catch (e) {
        log(`송신 치명적 실패: ${e.message}`, "err");
    }
}

async function readLoop() {
    while (serialPort && serialPort.readable && isConnected) {
        try {
            serialReader = serialPort.readable.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            
            while (true) {
                const { value, done } = await serialReader.read();
                if (done) break;
                
                buffer += decoder.decode(value);
                // 줄바꿈 단위로 파싱하여 로그창 리얼타임 바인딩
                if (buffer.includes('\n')) {
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // 완결되지 않은 잔여 데이터 롤백
                    lines.forEach(line => {
                        if (line.trim().length > 0) log(`RX ↵ ${line.trim()}`, "rx");
                    });
                }
            }
        } catch (error) {
            if (isConnected) {
                log(`수신 스트림 파괴됨: ${error.message}`, "err");
                resetConnectionState();
            }
            break;
        } finally {
            if (serialReader) {
                serialReader.releaseLock();
            }
        }
    }
}

// 4. 조종패드 포인터 정밀 이벤트 바인딩 (안전 정지 구현)
const driveCommands = { 'btn-F': 'F', 'btn-B': 'B', 'btn-L': 'L', 'btn-R': 'R' };
const servoCommands = { 'btn-XCW': 'XCW', 'btn-XCCW': 'XCCW', 'btn-YCW': 'YCW', 'btn-YCCW': 'YCCW' };

// 주행 매트릭스 패드에 걸린 모든 조작 키 순회 등록
Object.keys({...driveCommands, ...servoCommands}).forEach(id => {
    const btn = document.getElementById(id);
    
    btn.addEventListener('pointerdown', (e) => {
        // 특정 포인터 입력 트래킹 강제 캡처 고정 (멀티터치 시 튕김 방지)
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('active');
        
        const cmd = driveCommands[id] || servoCommands[id];
        sendCommand(cmd);
    });

    // 떼기, 터치 이탈, 윈도우 팝업 전환 등 모든 캔슬 상황 방어벽 수립
    const releaseHandler = (e) => {
        if (!btn.classList.contains('active')) return;
        btn.classList.remove('active');
        
        if (driveCommands[id]) {
            sendCommand('S'); // 주행 정지 명령
        } else if (servoCommands[id]) {
            // 서보 수동 정지 매핑
            if (id.startsWith('btn-X')) sendCommand('XS');
            if (id.startsWith('btn-Y')) sendCommand('YS');
        }
    };

    btn.addEventListener('pointerup', releaseHandler);
    btn.addEventListener('pointercancel', releaseHandler);
    btn.addEventListener('lostpointercapture', releaseHandler);
});

// 중앙 단독 수동 비상 브레이크 인스턴스
document.getElementById('btn-S').addEventListener('click', () => {
    sendCommand('S');
    sendCommand('Z');
});

// 5. 밸류 슬라이더 리액티브 바인딩
setupSlider('slider-x', 'val-x', (val) => `X${val}`);
setupSlider('slider-y', 'val-y', (val) => `Y${val}`);
setupSlider('slider-speed', 'val-speed', (val) => `P${val}`);

function setupSlider(sliderId, displayId, cmdFormatter) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    
    slider.addEventListener('input', (e) => {
        display.textContent = e.target.value;
        // 속도 슬라이더의 경우 인풋 트래킹과 동시에 고속 실시간 피드백 처리
        if (sliderId === 'slider-speed') {
            sendCommand(cmdFormatter(e.target.value));
        }
    });
}

// 가상각도 액션 버튼 송출 유틸
document.getElementById('btn-send-x').addEventListener('click', () => {
    const val = document.getElementById('slider-x').value;
    sendCommand(`X${val}`);
});
document.getElementById('btn-send-y').addEventListener('click', () => {
    const val = document.getElementById('slider-y').value;
    sendCommand(`Y${val}`);
});

// 6. 터미널 인터페이스 텍스트 송출 유틸
document.getElementById('btn-send-raw').addEventListener('click', sendRawFromInput);
cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendRawFromInput(); });

function sendRawFromInput() {
    const rawCmd = cmdInput.value.trim();
    if (rawCmd.length === 0) return;
    sendCommand(rawCmd);
    cmdInput.value = "";
}

// 매크로 신속 대응 단추 바인딩
document.querySelectorAll('.macro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        sendCommand(btn.getAttribute('data-cmd'));
    });
});

// 7. 실시간 터미널 텍스트 렌더러
function log(msg, type = "sys") {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const stamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${stamp}] ${msg}`;
    terminalLog.appendChild(line);
    terminalLog.scrollTop = terminalLog.scrollHeight;
}

// 8. 안전 제일: 탭 전환, 홈스크린 이탈 시 하드웨어 전체 정지 강제 차단막
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isConnected) {
        console.warn("Visibility lost. Emitting emergency stop matrix.");
        sendCommand('S');
        sendCommand('Z');
    }
});

// 9. 서비스 워커 백그라운드 PWA 시스템 등록
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log("PWA ServiceWorker Core Registered Successfully."))
            .catch(err => console.error("PWA ServiceWorker Registration Failed: ", err));
    });
}