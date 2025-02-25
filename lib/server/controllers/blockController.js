const bcash = require('bcash');
const { setCache, getCache } = require("../lib/redis");


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

			try {
				const result = await getCache(height);
				const cachedResult = JSON.parse(result);
				if (cachedResult)
					return res.json(cachedResult);
			} catch(err){
				console.error(err);
			}

			const blockHeader = await indexer.getBlockHeader(height);
			const blockHeaderString = blockHeader;
			const block = {
				height, 
				blockHeader: blockHeaderString
			};

			try {
				await setCache(height, JSON.stringify(block), 30);
			} catch(err) {
				console.error(err);
			}
			
			return res.json(block);
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

			try {
				const key = String(start) + String(end);
				const result = await getCache(key);
				const cachedResult = JSON.parse(result);
				if (cachedResult)
					return res.json(cachedResult);
			} catch(err){
				console.error(err);
			}

			const hashes = await indexer.getHashesByHeight(blockRange);

			try {
				const key = String(start) + String(end);
				await setCache(key, JSON.stringify(hashes), 30);
			} catch(err) {
				console.error(err);
			}
			
			return res.json(hashes);
		}

	},
}
