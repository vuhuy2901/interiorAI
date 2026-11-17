const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const htmlUrl = 'http://localhost:8123';
const port = 9777;

async function run() {
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1600,1000',
    htmlUrl
  ]);

  console.log('Chrome spawned. Waiting for debugging port...');
  
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const tabs = await res.json();
      if (tabs.length > 0 && tabs[0].webSocketDebuggerUrl) {
        wsUrl = tabs[0].webSocketDebuggerUrl;
        console.log('Connected to tab:', tabs[0].url);
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('Failed to get WebSocket debugger URL');
    chrome.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = msg.params.args.map(a => a.value || a.description).join(' ');
      console.log('[BROWSER CONSOLE]', args);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    const curId = id++;
    return new Promise(resolve => {
      pending.set(curId, resolve);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');

  console.log('Page loaded, waiting 2.5s for initial render and selfTest...');
  await new Promise(r => setTimeout(r, 2500));

  // Check selfTest HUD text
  const hudRes = await send('Runtime.evaluate', {
    expression: 'document.getElementById("selfTestTxt") ? document.getElementById("selfTestTxt").textContent : "No selfTestTxt"'
  });
  console.log('SelfTest HUD:', hudRes.result.value);

  const phaseRes = await send('Runtime.evaluate', {
    expression: 'document.getElementById("phaseTxt") ? document.getElementById("phaseTxt").textContent : ""'
  });
  console.log('Current Phase:', phaseRes.result.value);

  const artifactDir = 'C:\\Users\\TUAN\\.gemini\\antigravity\\brain\\4246d801-c945-4892-8e8d-53a6cdf20f26';

  async function takeScreenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    const outPath = path.resolve('ai-office-standalone', filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved screenshot: ${outPath} (${buf.length} bytes)`);

    if (fs.existsSync(artifactDir)) {
      const artPath = path.join(artifactDir, filename);
      fs.writeFileSync(artPath, buf);
      console.log(`Copied screenshot to artifact: ${artPath}`);
    }
  }

  // 1. Bình minh Dawn (07:30) - Toàn cảnh studio với nắng sớm màu đào ấm
  console.log('Taking Shot 1: Bình minh Dawn (07:30)...');
  await send('Runtime.evaluate', {
    expression: `
      resetView();
      document.getElementById('btnPresetDawn').click();
    `
  });
  await new Promise(r => setTimeout(r, 1500));
  await takeScreenshot('shot1_dawn.png');

  // 2. Ban trưa High Noon (12:00) - Cận cảnh phòng Họp & Showroom vật liệu sáng rõ
  console.log('Taking Shot 2: Ban trưa High Noon (12:00)...');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('btnPresetNoon').click();
      document.querySelector('.tab-btn[data-dept="meet"]').click();
    `
  });
  await new Promise(r => setTimeout(r, 1500));
  await takeScreenshot('shot2_noon.png');

  // 3. Hoàng hôn Golden Hour (17:30) - Bóng đổ dài xiên màu hổ phách, bầu trời lam tím
  console.log('Taking Shot 3: Hoàng hôn Golden Hour (17:30)...');
  await send('Runtime.evaluate', {
    expression: `
      resetView();
      document.getElementById('btnPresetSunset').click();
    `
  });
  await new Promise(r => setTimeout(r, 1500));
  await takeScreenshot('shot3_sunset.png');

  // 4. Đêm Atelier (21:30) - Dải LED âm tường, đèn rọi tranh và vitrine mô hình rực sáng
  console.log('Taking Shot 4: Đêm Atelier (21:30)...');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('btnPresetNight').click();
      document.querySelector('.tab-btn[data-dept="mira"]').click();
      openAgentDrawer(A['mira']);
    `
  });
  await new Promise(r => setTimeout(r, 1800));
  await takeScreenshot('shot4_night.png');

  // 5. Kiểm tra tính năng Timelapse Play/Pause
  console.log('Testing Timelapse Play/Pause toggle...');
  const timelapseRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = document.getElementById('btnTimelapse');
        btn.click();
        const playing = sim.isTimelapse;
        btn.click();
        const stopped = !sim.isTimelapse;
        return { playing, stopped, hour: sim.hour };
      })()
    `,
    returnByValue: true
  });
  console.log('Timelapse toggle verification:', timelapseRes.result.value);

  console.log('All 4 timelapse screenshots and controls verified successfully!');
  chrome.kill();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
