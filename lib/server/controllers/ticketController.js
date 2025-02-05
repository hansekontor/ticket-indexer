const bcash = require('bcash');
const {
	Address
} = bcash;
const Validator = require('bval');
const { setCache, getCache } = require("../lib/redis");


module.exports = {
	getTicketDataByAddress(indexer) {
		return async function(req, res) {
			const valid = Validator.fromRequest(req);
			const addrString = valid.str('address');

			try {
				const result = await getCache(addrString);
				const cachedResult = JSON.parse(result);
				if (cachedResult)
					return res.json(cachedResult);
			} catch(err){
				console.error(err);
			}

			const address = new Address(addrString);
			console.log("getTicketDataByAddress", address);
			if (!address) {
				return res.send("Invalid Address")
			}
			const txs = await indexer.getTxsByAddress(address);
			console.log(txs.length, "tx found");
			const utxos = await indexer.getTokenUtxosByAddress(addrString);
			console.log(utxos.length, "utxos found");
			const ticketDataByAddress = {
				txs, 
				utxos
			}
			
			try {
				await setCache(addrString, JSON.stringify(ticketDataByAddress), 30);
			} catch(err) {
				console.error(err);
			}

			return res.json(ticketDataByAddress);
		}
	},
	getRedeemTxByIssueHash(indexer) {
		return async function(req, res) {
			//const validHash = validateHash(req.params.hash);
			const valid = Validator.fromRequest(req);
			//console.log("validator", validator);
			const brhash = valid.brhash('hash');
			console.log("brhash", brhash);
	
			if (!brhash) 
				return res.send("Invalid Hash");

			try {
				const key = brhash.toString("hex");
				const result = await getCache(key);
				const cachedResult = JSON.parse(result);
				if (cachedResult)
					return res.json(cachedResult);
			} catch(err){
				console.error(err);
			}

			const redeemTx = await indexer.getRedeemTx(brhash);
			if (!redeemTx) {
				res.status(400);
					return res.send("No redeem tx found");
			}
				
			try {
				const rhash = brhash.toString("hex")
				await setCache(rhash, JSON.stringify(redeemTx), 30);
			} catch(err) {
				console.error(err);
			}
			
			return res.json(redeemTx);
		}
	},
	rollbackIndexer(indexer) {
		return async function(req, res) {
            const isValidHeader = true;
			if (!isValidHeader) {
				return res.send("Invalid Header");
			}
            const height = req.params.height;
            indexer.syncing = true;
            await indexer._rollback(height);
            indexer.syncing = false;
            indexer.sync();
            
            return res.send(`ticket-indexer rolled back to height: ${height}`);
      }
	}
}
