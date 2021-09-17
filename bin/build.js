#!/usr/bin/env node

const build = require('../src/build')
let config = require('../src/config').parse()
config.mode = 'build'

let startTime = new Date().getTime()

if (config.onBuildStart) config.onBuildStart(config)
build(config.entry, config.output, true, config).then(() => {
    if (config.onBuildEnd) config.onBuildEnd(config)

    let usedTime = new Date().getTime() - startTime
    console.info('\nDone\t\033[36m', (usedTime / 1000).toFixed(3), '\033[0m')
})
