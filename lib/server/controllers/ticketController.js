const bcash = require('bcash');
const {
	Address
} = bcash;
const Validator = require('bval');

function validateAddress(addressString) {
	const address = new Address(addressString);

	return address;
}

function validateHash(hash) {

	return hash;
}

module.exports = {
	getTicketsByAddress(indexer) {
		return async function(req, res) {
			console.log("getTicketsByAddress()");
			const type = "redeem";
			const address = validateAddress(req.params.addr);
			if (!address) {
				return res.send("Invalid Address")
			}
			const hashes = await indexer.getMetaByAddress(address, type);
			return res.send(hashes);
		}
	},
	getTicketsByHeight(indexer) {
		return async function (req, res) {
			const blockRange = {
				start: 866630, 
				last: 866640
			};
			const type = "redeem";
			const metas = await indexer.getMetaByHeight(blockRange);
			return res.json(metas);
		}

	},
	getIssueTx(indexer) {
		return async function(req, res) {
			//const validHash = validateHash(req.params.hash);
			const valid = Validator.fromRequest(req);
//console.log("validator", validator);
			const brhash = valid.brhash('hash');
console.log("brhash", brhash);
	
			if (!brhash) 
				return res.send("Invalid Hash");

			const issueTx = await indexer.getIssueTx(brhash);
			
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
