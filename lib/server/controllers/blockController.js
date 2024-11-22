const bcash = require('bcash');

function validateHeight(heightInput) {
	try {
		const height = Number(heightInput);
		return height;
	} catch(err) {
		return false;
	}
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
			const blockHeaderString = blockHeader;
			const block = {
				height, 
				blockHeader: blockHeaderString
			};

			return res.send(block);
		}
	},
}
