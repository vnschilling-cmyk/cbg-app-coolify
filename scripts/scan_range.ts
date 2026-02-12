import net from 'net';

async function scanRange(start, end) {
    for (let port = start; port <= end; port++) {
        const exists = await new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(50);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(port, '127.0.0.1');
        });
        if (exists) {
            console.log(`>>> PORT OPEN: 127.0.0.1:${port}`);
        }
    }
}

scanRange(8000, 9000);
