const { setCache, getCache } = require("../lib/redis");
const path = require('path');
const { API_KEY } = require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }).parsed;

function validateHeader(req) {
    const expectedToken = API_KEY;
    if (!expectedToken) {
        console.error("No API_KEY specified");
        return false;
    }

    const authHeader = req.get('Authorization');
    if (!authHeader) 
        return false;

    const token = authHeader.slice(7);
    const isValid = token === expectedToken;
    
    if (!isValid) {
        console.error("Wrong authentication token provided");
    }

    return isValid;
}

module.exports = {
    rollbackIndexer(indexer) {
        return async function(req, res) {
            const isValidHeader = validateHeader(req);
            if (!isValidHeader) {
                return res.send("Invalid Header");
            }

            const height = req.params.height;
            indexer.syncing = true;
            await indexer._rollback(height);
            indexer.syncing = false;
            indexer.sync();

            return res.send(`token-indexer rolled back to height ${height}`);            
        }
    }
}