const bcash = require('bcash');
const {
	Address
} = bcash;

function validateAddress(addressString) {
	const address = new Address(addressString);

	return address;
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
console.log("getTicketsByHeight()");
			const blockRange = {
				start: 866630, 
				last: 866640
			};
			const type = "redeem";
			const metas = await indexer.getMetaByHeight(blockRange);
console.log("# of metas", metas.length);
			return res.json(metas);
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
