// ==========================================================
// 1. 웹 블루투스 연결 함수 (모든 장치 검색 버전으로 수정)
// ==========================================================
async function connectBluetooth() {
  const statusEl = document.getElementById("status");
  statusEl.innerText = "장치 검색 중...";

  try {
    // [수정] 필터를 제거하고 주변의 모든 블루투스 장치를 다 띄우도록 변경했습니다.
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
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
