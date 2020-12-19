module.exports = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title></title>
    <style>
        body {
            margin: 0;
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            bottom: 0;
            overflow: hidden;
        }

        #index {
            border: none;
            width: 100%;
            height: 100%;
        }
    </style>
    <script>
        let ws

        function connect() {
            ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/ws')
            ws.onopen = refreshView
            ws.onmessage = refreshView
            ws.onclose = () => {
                ws = null
            }
        }

        function refreshView() {
            if (index.src) {
                index.contentWindow.location.reload()
            } else {
                index.src = 'index.html'
            }
        }

        addEventListener('load', () => {
            connect()
            setInterval(() => {
                if (!ws) connect()
            }, 1000)
        })

    </script>
</head>
<body>
<iframe id="index"></iframe>
</body>
</html>`