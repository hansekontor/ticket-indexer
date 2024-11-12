const bcash = require('bcash');
const {
	Address
} = bcash;

function validateAddress(addressString) {
	const address = new Address(addressString);

	return address;
}

module.exports = {
	getBlockHeader(indexer) {
		return async function(req, res) {
			console.log("getBlockHeader()");
			const height = validateHeight(req.params.height);
			if (!height) {
				return res.send("Invalid Height")
			}
			const blockHeader = await indexer.getBlockHeader(height);
			
			return res.send(blockHeader);
		}
	},
}
