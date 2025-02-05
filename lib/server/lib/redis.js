require('dotenv').config()
const Redis = require('ioredis')
const rconf = {
    'host': process.env.REDIS_HOST,
    'port': process.env.REDIS_PORT,
    'password': process.env.REDIS_PASSWORD
}

const redis = new Redis(rconf);

/**
 * Redis key-value pairs
 * address -> utxos and txs for this address
 * rhash -> redeemTx for this hash
 * height -> block obj including block header
 * [height][height] -> hashes by height
 */

module.exports.setCache = async (key, value, expiry) => {
    return redis.set(key, value, "EX", expiry)
}

module.exports.getCache = async (key) => {
    return redis.get(key)
}