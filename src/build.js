const fs = require('fs')
const path = require('path')
const htmlUglify = require('html-minifier');
const jsUglify = require('uglify-es');
const cssUglify = require('clean-css');
const browserify = require('browserify');
const babelCore = require('@babel/core');
const postcss = require('postcss');
const postcssImport = require('postcss-import');

const htmlUglifyOptions = {
    removeComments: true,
    collapseWhitespace: true,
    minifyJS: true,
    minifyCSS: true
}

function build(entry, output, production, onMake) {
    let fi = fs.statSync(entry)
    if (fi.isDirectory()) {
        // 清空输出文件夹
        if (fs.existsSync(output)) {
            fs.rmSync(output, {recursive: true})
        }

        // 构建目录
        return buildPath(entry, output, production, onMake)
    } else {
        // 输出到目录时拼接文件
        if (fs.existsSync(output) && fs.statSync(output).isDirectory()) {
            output = path.join(output, path.basename(entry))
        }

        // 删除输出文件
        if (fs.existsSync(output)) {
            fs.unlinkSync(output)
        }
        // 构建文件

        return buildFile(entry, output, production, onMake)
    }
}

function buildPath(entry, output, production, onMake) {
    // 构建文件夹下所有文件
    let tasks = []
    for (let f of fs.readdirSync(entry, {withFileTypes: true})) {
        if (f.name.startsWith('.')) {
            // 清除残留临时文件
            if ((f.isFile() && f.name.startsWith('._tmp_'))) {
                fs.unlinkSync(path.join(entry, f.name))
            }
            continue
        }

        let newEntry = path.join(entry, f.name)
        let newOutput = path.join(output, f.name)
        if (f.isFile()) {
            if (f.name.endsWith('.html')) {
                // 构建html
                tasks.push(buildFile(newEntry, newOutput, production, onMake))
            } else if (!f.name.endsWith('.js') && !f.name.endsWith('.css') && !f.name.endsWith('.yml')) {
                // 除了js、css、yml之外的文件都作为资源复制到输出文件夹
                fs.mkdirSync(path.dirname(newOutput), {recursive: true})
                fs.copyFile(newEntry, newOutput, ()=>{})
            }
        } else if (f.isDirectory()) {
            tasks.push(buildPath(newEntry, newOutput, production, onMake))
        }
    }

    // 返回任务的Promise
    if (tasks.length > 1) {
        return Promise.all(tasks)
    } else if (tasks.length === 1) {
        return tasks[0]
    } else {
        // 没有子任务时返回空的构建任务
        return new Promise(resolve => {
            resolve()
        })
    }
}

function buildFile(entry, output, production, onMake) {
    return new Promise(allResolve => {
        if (!entry.endsWith('.html') || !fs.existsSync(entry)) {
            allResolve()
            return
        }

        let entryPath = path.dirname(entry)
        let startTime = new Date().getTime()
        let failed = false

        let html = fs.readFileSync(entry).toString()

        let matchIndex = 1

        // 查找css引用
        let styleMatches = []
        let matchs = html.matchAll(/<link.+?href="(.*?\.css)".*?>/gsi)
        if (matchs) {
            for (let m of matchs) {
                let filePath = path.join(entryPath, m[1])
                if (fs.existsSync(filePath)) {
                    let replaceTag = `{{__REPLACE__${matchIndex}__}}`
                    matchIndex++
                    html = html.replace(m[0], replaceTag)
                    styleMatches.push([replaceTag, fs.readFileSync(filePath).toString()])
                }
            }
        }

        // 查找js引用
        let scriptMatches = []
        matchs = html.matchAll(/<script.+?src="(.*?\.js)".*?\/.*?>/gsi)
        if (matchs) {
            for (let m of matchs) {
                let filePath = path.join(entryPath, m[1])
                if (fs.existsSync(filePath)) {
                    let replaceTag = `{{__REPLACE__${matchIndex}__}}`
                    matchIndex++
                    html = html.replace(m[0], replaceTag)
                    scriptMatches.push([replaceTag, fs.readFileSync(filePath).toString()])
                }
            }
        }

        // 查找script
        matchs = html.matchAll(/<script>(.*?)<\/script>/gsi)
        if (matchs) {
            for (let m of matchs) {
                let replaceTag = `{{__REPLACE__${matchIndex}__}}`
                matchIndex++
                html = html.replace(m[0], replaceTag)
                scriptMatches.push([replaceTag, m[1]])
            }
        }

        // 查找style
        matchs = html.matchAll(/<style>(.*?)<\/style>/gsi)
        if (matchs) {
            for (let m of matchs) {
                let replaceTag = `{{__REPLACE__${matchIndex}__}}`
                matchIndex++
                html = html.replace(m[0], replaceTag)
                styleMatches.push([replaceTag, m[1]])
            }
        }

        // 添加css构建任务
        let allTasks = []
        for (let m of styleMatches) {
            allTasks.push(new Promise(resolve => {
                postcss([postcssImport({root: entryPath})]).process(m[1], {from: undefined}).then(css => {
                    html = html.replace(m[0], '<style>' + (!production ? css.css : new cssUglify().minify(css.css).styles) + '</style>')
                    resolve()
                }).catch(e => {
                    console.error(entry, e)
                    failed = true
                    resolve()
                })
            }))
        }

        // 添加js构建任务
        for (let m of scriptMatches) {
            allTasks.push(new Promise(resolve => {

                let tmpFile = path.join(entryPath, '._tmp_' + Math.ceil(Math.random() * 1000000) + '.js')
                fs.writeFileSync(tmpFile, m[1])
                let b = browserify(tmpFile).bundle()
                let a = []
                b.on('data', d => {
                    a.push(d.toString())
                })
                b.on('error', e => {
                    if (fs.existsSync(tmpFile)) {
                        fs.unlinkSync(tmpFile)
                    }
                    console.error(entry, e)
                    failed = true
                    resolve()
                })
                b.on('end', () => {
                    if (fs.existsSync(tmpFile)) {
                        fs.unlinkSync(tmpFile)
                    }
                    let jsCode = a.join('')
                    if (production) {
                        // 生产模式，转换为ES5并且压缩作为发行版本
                        jsCode = babelCore.transform(jsCode, {babelrc: false, presets: [['@babel/preset-env']]}).code
                        jsCode = jsUglify.minify(jsCode).code
                    }
                    html = html.replace(m[0], '<script>' + jsCode + '</script>')
                    resolve()
                })
            }))
        }

        // 处理所有任务
        Promise.all(allTasks).then(() => {
            if (production) {
                html = htmlUglify.minify(html, htmlUglifyOptions)
            }
            let usedTime = new Date().getTime() - startTime
            if (failed) {
                console.info(' >>', entry, '\t\033[35m', (usedTime / 1000).toFixed(3), '\033[0m')
            } else {
                if (onMake) {
                    let madeHtml = onMake(entry, html)
                    if (madeHtml) html = madeHtml
                }
                fs.mkdirSync(path.dirname(output), {recursive: true})
                fs.writeFileSync(output, html)
                console.info(' >>', entry, '\t\033[36m', (usedTime / 1000).toFixed(3), '\033[0m')
            }
            allResolve()
        })
    })
}

module.exports = build
