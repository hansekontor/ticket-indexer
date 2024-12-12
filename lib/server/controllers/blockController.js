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
	getRedeemedByHeight(indexer) {
		return async function (req, res) {
			let blockRange;
			const start = Number(req.query.start);
			const end = Number(req.query.end);
			const singleHeight = req.params.height;
			
			if (start > 0 && end > 0) {
				blockRange = {
					start, 
					end
				}
			} else {
				res.status(400);
				return res.send("Invalid height or height range.")
			}

			const metas = await indexer.getHashesByHeight(blockRange);
			return res.json(metas);
		}

	},
}
