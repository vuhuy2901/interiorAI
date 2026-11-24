const { spawn } = require('child_process');
const fs = require('fs');

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9889',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,800',
    'http://localhost:5173/office-3d'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch('http://127.0.0.1:9889/json');
      const tabs = await res.json();
      if (tabs.length > 0 && tabs[0].webSocketDebuggerUrl) {
        wsUrl = tabs[0].webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    chrome.kill();
    console.log('No debugger url');
    return;
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const curId = id++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        res(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await new Promise(r => setTimeout(r, 4000));

  const evalResult = await send('Runtime.evaluate', {
    expression: 'document.title + " | " + document.body.innerText.slice(0, 400)'
  });
  console.log('PAGE_INFO:', evalResult?.result?.value);

  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\QLDAPM-final\\interiorAI\\scratch\\office_3d_verified.png', Buffer.from(ss.data, 'base64'));
  console.log('Screenshot saved to scratch/office_3d_verified.png');

  ws.close();
  chrome.kill();
}
test();
