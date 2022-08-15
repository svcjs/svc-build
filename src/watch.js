const fs = require('fs')
const path = require('path')
const watch = require('node-watch')
const build = require('../src/build')

let pending = null
let building = false
const postfixMatcher = new RegExp(`(${path.sep}[^${path.sep}.]+)\.[^${path.sep}.]*$`)
let _config = {}
let _onUpdate
let _onStart

function buildOnWatch(name) {
    if (building) {
        // 如果正在构建中，放入pending稍后构建，如果pending已经有内容则下次全部构建
        pending = pending ? 'all' : name
        return
    }
    building = true

    let startTime = new Date().getTime()
    let task
    if (name === 'all' || fs.existsSync(name)) {
        console.info(name, 'changed')
        // 识别归属的视图
        // if (!name.endsWith('.html')) {
        //     let htmlFileName = name.replace(postfixMatcher, '$1.html')
        //     if (fs.existsSync(htmlFileName)) name = htmlFileName
        // }

        // 创建构建任务
        if (name.endsWith('.html') && name.indexOf('/_') === -1) {
            task = buildOne(name)
        } else if (!name.endsWith('.js') && !name.endsWith('.css') && !name.endsWith('.html') && !name.endsWith('.yml')) {
            // 除了js、css、yml之外的文件都作为资源复制到输出文件夹
            let dstName = _config.output + name.substr(_config.entry.length)
            fs.mkdirSync(path.dirname(dstName), {recursive: true})
            task = new Promise(resolve => {
                fs.copyFile(name, dstName, () => {
                    resolve()
                })
            })
        } else {
            task = buildAll()
        }
    } else {
        console.info(name, 'removed')
        // 删除资源
        let dstName = _config.output + name.substr(_config.entry.length)
        task = new Promise(resolve => {
            fs.unlink(dstName, () => {
                resolve()
            })
        })
    }


    // 进行构建
    task.then(() => {
        if (_config.onBuildEnd) _config.onBuildEnd(_config)

        // 触发onUpdate事件
        if (_onUpdate) _onUpdate(name)

        building = false
        let usedTime = new Date().getTime() - startTime
        console.info('Done\t\033[36m', (usedTime / 1000).toFixed(3), '\033[0m')
        console.info('')

        // 构建队列中的任务
        if (pending) {
            let pendingName = pending
            pending = null
            buildOnWatch(pendingName)
        }
    })
}

// 监听文件变化，触发构建
function start(config, {onUpdate, onStart}) {
    _onUpdate = onUpdate
    _onStart = onStart
    _config = config
    let startTime = new Date().getTime()
    buildAll().then(() => {
        if (_config.onBuildEnd) _config.onBuildEnd(_config)
        let usedTime = new Date().getTime() - startTime
        console.info('Done\t\033[36m', (usedTime / 1000).toFixed(3), '\033[0m')

        // 触发onStart事件
        if (_onStart) _onStart()

        console.info('\nwatching \033[36m', _config.entry, '\033[0m ...\n')
        watch(_config.entry, {recursive: true}, (_, name) => {
            // 过滤隐藏文件
            // if (name.indexOf(path.sep + '.') !== -1 || name.indexOf(path.sep + '_') !== -1) return
            if (name.indexOf(path.sep + '.') !== -1) return
            buildOnWatch(name)
        })
    })
}

function buildAll() {
    if (_config.onBuildStart) _config.onBuildStart(_config)
    return build(_config.entry, _config.output, false, _config)
}

function buildOne(entry) {
    return build(entry, _config.output + entry.substr(_config.entry.length), false, _config)
}

module.exports = {start}