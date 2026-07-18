// 블루투스 연결을 위한 전역 변수
let bluetoothDevice = null;
let txCharacteristic = null;

// HC-05 모듈 표준 시리얼 통신(SPP) UUID 설정
const UUID_SERVICE = "00001101-0000-1000-8000-00805f9b34fb"; 
const UUID_CHARACTERISTIC = "00001101-0000-1000-8000-00805f9b34fb";

// ==========================================================
// 1. 블루투스 연결 제어
// ==========================================================
async function connectBluetooth() {
  const statusEl = document.getElementById("status");
  statusEl.innerText = "장치 검색 중...";

  try {
    // 블루투스 장치 팝업 요청 (이름이 HC로 시작하거나 HC-05인 기기 타겟팅)
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'HC' }, { name: 'HC-05' }],
      optionalServices: [UUID_SERVICE]
    });

    statusEl.innerText = "서버 연결 중...";
    const server = await bluetoothDevice.gatt.connect();

    statusEl.innerText = "프로토콜 서비스 탐색 중...";
    const service = await server.getPrimaryService(UUID_SERVICE);

    statusEl.innerText = "통신 채널(Characteristic) 획득 중...";
    txCharacteristic = await service.getCharacteristic(UUID_CHARACTERISTIC);

    statusEl.innerText = `🟢 연결됨: ${bluetoothDevice.name}`;
    statusEl.style.color = "#00adb5";
    alert("🎉 블루투스 연결 성공! 이제 조종이 가능합니다.");

  } catch (error) {
    console.error("블루투스 오류:", error);
    statusEl.innerText = "🔴 연결 실패 (클릭하여 재시도)";
    statusEl.style.color = "#ff2e63";
    alert(`연결 실패: ${error.message}\n\n[주의] GitHub Pages(https) 주소와 크롬 브라우저를 사용했는지 확인하세요.`);
  }
}

// ==========================================================
// 2. 아두이노 명령 전송 함수 (줄바꿈 \n 필수 포함)
// ==========================================================
async function sendCommand(cmd) {
  if (!txCharacteristic) {
    console.log(`[미연결] 전송 보류 ➔ ${cmd}`);
    return;
  }
  try {
    const encoder = new TextEncoder();
    // 아두이노 코드의 파서 규칙(줄바꿈 인식)에 맞춰 명령 뒤에 \n을 결합하여 전송합니다.
    const data = encoder.encode(cmd + "\n"); 
    await txCharacteristic.writeValue(data);
    console.log(`[전송 완료] ➔ ${cmd}`);
  } catch (error) {
    console.error("데이터 전송 에러:", error);
  }
}

// ==========================================================
// 3. 키보드 제어 로직 (WASD / 손 떼면 정지)
// ==========================================================
let isKeyPressed = false; // 키를 누르고 있을 때 무한 연타 전송되는 것을 차단하는 플래그
let lastKey = "";

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  
  // 키를 꾹 누르고 있을 때 발생하는 중복 이벤트 필터링
  if (isKeyPressed && lastKey === key) return; 

  switch (key) {
    case "w":
      isKeyPressed = true; lastKey = key;
      sendCommand("F"); // 전진
      break;
    case "s":
      isKeyPressed = true; lastKey = key;
      sendCommand("B"); // 후진
      break;
    case "a":
      isKeyPressed = true; lastKey = key;
      sendCommand("L"); // 좌회전
      break;
    case "d":
      isKeyPressed = true; lastKey = key;
      sendCommand("R"); // 우회전
      break;
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  
  // 제어 키(WASD)에서 손을 떼는 순간 즉시 정지 명령 전송
  if (key === "w" || key === "s" || key === "a" || key === "d") {
    isKeyPressed = false;
    lastKey = "";
    sendCommand("S"); // 정지
  }
});

// ==========================================
// 4. 마우스 클릭 및 화면 터치 제어 활성화
// ==========================================
document.getElementById("connect-btn").addEventListener("click", connectBluetooth);

// 마우스로 누를 때 구동
document.getElementById("btn-f").addEventListener("mousedown", () => sendCommand("F"));
document.getElementById("btn-b").addEventListener("mousedown", () => sendCommand("B"));
document.getElementById("btn-l").addEventListener("mousedown", () => sendCommand("L"));
document.getElementById("btn-r").addEventListener("mousedown", () => sendCommand("R"));
document.getElementById("btn-s").addEventListener("mousedown", () => sendCommand("S"));

// 마우스를 뗄 때 정지
const dirButtons = ["btn-f", "btn-b", "btn-l", "btn-r"];
dirButtons.forEach(id => {
    document.getElementById(id).addEventListener("mouseup", () => sendCommand("S"));
    // 스마트폰 환경을 위한 터치 이벤트 대응
    document.getElementById(id).addEventListener("touchstart", (e) => { e.preventDefault(); sendCommand("F"); });
    document.getElementById(id).addEventListener("touchend", () => sendCommand("S"));
});
