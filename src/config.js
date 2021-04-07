const fs = require('fs')
const path = require('path')

function parse() {
    let config = {}

    // 读取项目中的构建配置
    if (fs.existsSync(path.join(process.cwd(), 'build.config.js'))) {
        config = require(path.join(process.cwd(), 'build.config.js'))
    }

    // 读取本地环境配置
    if (fs.existsSync(path.join(process.cwd(), 'dev.config.js'))) {
        let userConfig = require(path.join(process.cwd(), 'dev.config.js'))
        for (let k in userConfig) {
            config[k] = userConfig[k]
        }
    }

    // build.js
    // module.exports = {
    //     entry: 'src',
    //     output: 'www',
    //     onMake: (file, html) => {
    //     },
    //     onBuildStart: () => {
    //     },
    //     onBuildEnd: () => {
    //     },
    //     onExit: () => {
    //     },
    // }

    // build.js
    // module.exports = {
    //     devServerPort: 8080,
    //     apiServerPort: 8081,
    //     sslKey: '',
    //     sslCert: '',
    // }

    // 默认配置
    if (config.entry === undefined) config.entry = 'src'
    if (config.output === undefined) config.output = 'www'
    if (config.devServerPort === undefined) config.devServerPort = 8080
    if (config.apiServerHost === undefined) config.apiServerHost = 'localhost'
    if (config.apiServerPort === undefined) config.apiServerPort = 8081

    // 处理命令行参数
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === '--help') {
            console.info(`
Usage:

    build [-o output] [entry]
    dev [-o output] [entry]
`)
            process.exit()
            return
        } else if (process.argv[i - 1] === '-o') {
            config.output = process.argv[i]
        } else if (!process.argv[i].startsWith('-')) {
            if (fs.existsSync(process.argv[i])) {
                config.entry = process.argv[i]
            }
        }
    }

    return config
}

module.exports = {parse}
