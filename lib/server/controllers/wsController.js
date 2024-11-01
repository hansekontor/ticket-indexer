// Controller for WebSocket

const handleWsError = async (err, ws, signal) => {
    console.log(err)
    // ws.close(500, err.message)
    ws.terminate()
}

module.exports = async (ws, req) => {
    try {
        ws.send('connected')
        console.log('connected')

        const handleClose = async() => {
            console.log('closing')
        }

        const clearPoll = function(pollFunc) {
            clearInterval(pollFunc)
            ws.terminate()
        }

        const polling = setInterval(async function() {
            console.log('polling')
        }, 1000);
    
        ws.on('message', async function incoming(message) {
            try {
                console.log('received: ', message)
                ws.send('echo: ' + message)
                // Uncomment this line to disconnect on response
                // clearPoll(polling)
            } catch (err) {
                await handleWsError(err, ws, signal)
            }
        });

        ws.on('close', async function close() {
            await handleClose()
            console.log('disconnected');
            clearInterval(polling)
        });

        // Timeout and force close connection after 5 minutes
        setTimeout(async function () {
            await handleClose()
        }, 5 * 60 * 1000);

    } catch (err) {
        await handleWsError(err, ws, signal)
    }
}