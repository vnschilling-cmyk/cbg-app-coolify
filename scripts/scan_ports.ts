import net from 'net';

const ports = [8090, 8080, 80, 443, 3000, 5173, 8000];
const hosts = ['127.0.0.1', 'localhost', '0.0.0.0'];

async function scan() {
    for (const host of hosts) {
        for (const port of ports) {
            console.log(`Checking ${host}:${port}...`);
            const exists = await new Promise((resolve) => {
                const socket = new net.Socket();
                socket.setTimeout(200);
                socket.on('connect', () => {
                    socket.destroy();
                    resolve(true);
                });
                socket.on('timeout', () => {
                    socket.destroy();
                    resolve(false);
                });
                socket.on('error', () => {
                    socket.destroy();
                    resolve(false);
                });
                socket.connect(port, host);
            });
            if (exists) {
                console.log(`>>> PORT OPEN: ${host}:${port}`);
            }
        }
    }
}

scan();
