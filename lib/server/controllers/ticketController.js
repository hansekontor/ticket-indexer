const bcash = require('bcash');
const {
	Address
} = bcash;
const Validator = require('bval');


module.exports = {
	getTicketDataByAddress(indexer) {
		return async function(req, res) {
			const valid = Validator.fromRequest(req);
			const addrString = valid.str('address');
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

			const redeemTx = await indexer.getRedeemTx(brhash);
			if (!redeemTx) {
				res.status(400);
					return res.send("No redeem tx found");
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
