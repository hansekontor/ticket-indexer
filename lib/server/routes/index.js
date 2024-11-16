// Main router entry point, sets up all route modules

const express = require('express')
const router = express.Router()

const { getTicketRouter } = require('./ticketRouter');
const { getBlockRouter } = require('./blockRouter');

module.exports = function routes(indexer) {
    router.use('/ticket/', getTicketRouter(indexer));
	router.use('/block/', getBlockRouter(indexer));
    return router;
}
