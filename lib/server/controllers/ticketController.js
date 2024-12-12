const bcash = require('bcash');
const {
	Address
} = bcash;
const Validator = require('bval');


module.exports = {
	getTicketDataByAddress(indexer) {
		return async function(req, res) {
			const valid = Validator.fromRequest(req);
			const addr = valid.str('address');
			const address = new Address(addr);
			console.log("getTicketDataByAddress", address);
			if (!address) {
				return res.send("Invalid Address")
			}
			const txs = await indexer.getTxsByAddress(address);
			console.log(txs.length, "tx found");
			// const utxos = await indexer.getTokenUtxosByAddress(addr);
			// console.log(utxos.length, "utxos found");
			const ticketDataByAddress = {
				txs, 
				utxos: []
			}

			return res.send(ticketDataByAddress);
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

			const issueTx = await indexer.getRedeemTx(brhash);
			
			return res.json(issueTx);
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
