const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--remote-debugging-port=9446', '--disable-gpu', '--no-sandbox',
  'file:///C:/Users/TUAN/Downloads/qldapm_fina/ai-office-standalone/index.html'
]);

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9446/json');
    const tabs = await res.json();
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    ws.onopen = () => {
      const expr = `
        (() => {
          const lobbyStart = [0, 8, 14];
          const testPoints = [
            { name: 'Xưởng Thiết kế', pt: [0, seats['d_an'].ap[0], seats['d_an'].ap[1]] },
            { name: 'Xưởng BIM', pt: [0, seats['d_minh'].ap[0], seats['d_minh'].ap[1]] },
            { name: 'Phòng Fansipan', pt: [1, seats[meetingRoomsData.fansipan.seats[0]].ap[0], seats[meetingRoomsData.fansipan.seats[0]].ap[1]] },
            { name: 'Phòng Tam Đảo', pt: [1, seats[meetingRoomsData.tamdao.seats[0]].ap[0], seats[meetingRoomsData.tamdao.seats[0]].ap[1]] },
            { name: 'CEO Suite', pt: [1, seats['d_mira'].ap[0], seats['d_mira'].ap[1]] }
          ];
          const results = testPoints.map(t => {
            const p1 = astar3D(lobbyStart, t.pt, 'mira');
            const p2 = astar3D(t.pt, lobbyStart, 'mira');
            return {
              name: t.name,
              start: lobbyStart,
              target: t.pt,
              forward: p1 !== null,
              reverse: p2 !== null,
              p1Len: p1 ? p1.length : 0,
              p2Len: p2 ? p2.length : 0
            };
          });
          return results;
        })()
      `;
      ws.send(JSON.stringify({
        id: 1, method: 'Runtime.evaluate', params: {
          expression: expr,
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === 1) {
        console.log('Test results:', JSON.stringify(msg.result.result.value, null, 2));
        chrome.kill();
        process.exit(0);
      }
    };
  } catch(err) {
    console.error(err);
    chrome.kill();
    process.exit(1);
  }
}, 1500);
