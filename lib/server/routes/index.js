// Main router entry point, sets up all route modules

const express = require('express')
const router = express.Router()

const { getTicketRouter } = require('./ticketRouter');
const { getBlockRouter } = require('./blockRouter');
const { getRollbackRouter } = require('./rollbackRouter');

module.exports = function routes(indexer) {
    router.use('/ticket/', getTicketRouter(indexer));
	router.use('/block/', getBlockRouter(indexer));
    router.use('/rollback', getRollbackRouter(indexer));
    return router;
}
