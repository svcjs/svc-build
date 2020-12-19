#!/usr/bin/env node

let watch = require('../src/watch')
let server = require('../src/server')
let config = require('../src/config').parse()
config.mode = 'dev'

process.on('SIGINT', function () {
    if (config.onExit) config.onExit()
    process.exit();
});

watch.start(config, {
    onUpdate: name => {
        // 广播更新事件
        server.broadcast({action: 'changed', name})
    },
    onStart: () => {
        server.start(config)
    },
})
