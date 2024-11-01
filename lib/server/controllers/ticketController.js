module.exports = {
	getTicketsByAddress(ndexer) {
		return async function(req, res) {
			console.log("getTicketsByAddress()");

			return res.send("Placeholder")
		}
	},
	rollbackIndexer(indexer) {
		return async function(req, res) {
            const isValidHeader = true;
			if (!isValidHeader) {
				return res.send("Invalid Header");
			}
            const height = req.params.height;
            ticketIndexer.syncing = true;
            await ticketIndexer._rollback(height);
            ticketIndexer.syncing = false;
            ticketIndexer.sync();
            
            return res.send(`ticket-indexer rolled back to height: ${height}`);
      }
	}
}