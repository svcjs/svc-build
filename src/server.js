const fs = require('fs')
const path = require('path')
const http = require('http');
const https = require('https');
const ws = require('ws');
const mimeTypes = require('mime-types');

let _config = {}
let conns = []

function doRequest(req, res) {
    let urlPath = req.url.split('?')[0]
    if (path.sep !== '/') urlPath = urlPath.replace('/\//g', path.sep)
    let filePath = _config.output + urlPath
    let fileExists = fs.existsSync(filePath)
    if (fileExists && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html')
        fileExists = fs.existsSync(filePath)
    }
    if (fileExists) {
        res.writeHead(200, 'Content-Type: ' + mimeTypes.lookup(filePath))
        res.write(fs.readFileSync(filePath))
        res.end()
    } else {
        // 代理请求到 app.host
        let headers = {}
        for (let i = 1; i < req.rawHeaders.length; i += 2) {
            headers[req.rawHeaders[i - 1]] = req.rawHeaders[i]
        }

        req2 = http.request({
            host: _config.apiServerHost,
            port: _config.apiServerPort,
            method: req.method,
            path: req.url,
            headers: headers,
            keepHeaderCase: true,
        }, res2 => {
            for (let k in res2.headers) {
                if (k !== 'transfer-encoding') {
                    if (!res.writableEnded) {
                        res.setHeader(k, res2.headers[k])
                    }
                }
            }
            res2.pipe(res)
        })
        req2.on('error', () => {
            res.end()
        })

        req.on('error', () => {
            req2.end()
            res.end()
        })

        req.on('data', chunk => {
            req2.write(chunk)
        })

        req.on('end', () => {
            req2.end()
        })
    }
}

function start(config) {
    _config = config

    let server
    if (_config.sslKey && _config.sslCert) {
        server = https.createServer({
            key: fs.readFileSync(_config.sslKey),
            cert: fs.readFileSync(_config.sslCert),
        }, doRequest)
    } else {
        server = http.createServer(doRequest)
    }

    let wsServer = new ws.Server({noServer: true})
    server.on('upgrade', (req, socket, head) => {
        if (req.url === '/ws') {
            wsServer.handleUpgrade(req, socket, head, conn => {
                if (_config.onConnect) {
                    _config.onConnect(conn)
                }

                conns.push(conn)
                if (_config.onMessage) {
                    conn.on('message', message => {
                        let msg = JSON.parse(message)
                        _config.onMessage(conn, msg)
                    })
                }
                conn.on('close', () => {
                    for (let i = 0; i < conns.length; i++) {
                        if (conns[i] === conn) {
                            conns = conns.splice(i, 1)
                            break
                        }
                    }
                })
            })
        } else {
            socket.destroy()
        }
    })

    server.on('error', e => {
        console.error(e)
    })

    server.listen(_config.devServerPort)
    console.info('build server started on \033[36m' + _config.devServerPort + '\033[0m', (_config.sslKey && _config.sslCert ? 'with ssl' : ''))
    console.info('')
}

function broadcast(msg) {
    let encodedMsg = JSON.stringify(msg)
    for (let conn of conns) {
        conn.send(encodedMsg)
    }
}

module.exports = {start, broadcast}
