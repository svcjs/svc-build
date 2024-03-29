const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const ws = require('ws')
const mimeTypes = require('mime-types')
const devHtml = require('./dev.html')

let _config = {}
let conns = []

function doRequest(req, res) {
    let urlPath = req.url.split('?')[0]
    if (path.sep !== '/') urlPath = urlPath.replace('/\//g', path.sep)
    let filePath = _config.output + urlPath
    if (filePath.endsWith('/dev_index.html') && !fs.existsSync(filePath) && fs.existsSync(filePath.replace('/dev_index.html', '/index.html'))) {
        filePath = filePath.replace('/dev_index.html', '/index.html')
    }
    let fileExists = fs.existsSync(filePath)
    if (fileExists && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html')
        fileExists = fs.existsSync(filePath)
    }
    if (fileExists) {
        let mimeType = mimeTypes.lookup(filePath)
        let fileData = fs.readFileSync(filePath)
        let fileInfo = fs.statSync(filePath)
        res.setHeader('Content-Type', mimeType)
        res.setHeader('Last-Modified', fileInfo.mtime.getTime().toString())
        if(_config.allowOrigin) {
            res.setHeader("Access-Control-Allow-Origin", _config.allowOrigin);
            res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");
            res.setHeader("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
        }
        res.writeHead(200)
        res.write(fileData)
        res.end()
        if(_config.logRequest) {
            console.info(req.method, req.url, filePath, mimeType, fileData.length)
        }
    } else if (urlPath === '/dev.html') {
        // 默认的开发页
        let mimeType = mimeTypes.lookup(filePath)
        let fileData = devHtml.replace(/__APP_PATH__/g, _config.appPath)
        res.setHeader('Content-Type', mimeType)
        res.writeHead(200)
        res.write(fileData)
        res.end()
        if(_config.logRequest) {
            console.info(req.method, req.url, filePath, mimeType, fileData.length)
        }
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
            res.writeHead(res2.statusCode)
            res2.pipe(res)
            if(_config.logRequest) {
                console.info('  == PROXY',req.method, req.url, res2.statusCode)
            }
        })
        req2.on('error', err => {
            res.writeHead(404)
            res.end()
            if(_config.logRequest) {
                console.info('  == PROXY', req.method, req.url, 404, err)
            }
        })

        req.on('error', err => {
            req2.end()
            res.end()
            if(_config.logRequest) {
                console.info('  == PROXY',req.method, req.url, 400, err)
            }
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
                conn.on('message', message => {
                    if (message === 'PING') {
                        conn.send('PONG')
                        return
                    }
                    if (_config.onMessage) {
                        let msg = JSON.parse(message)
                        _config.onMessage(conn, msg)
                    }
                })
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
