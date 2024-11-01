// Main router entry point, sets up all route modules

const express = require('express')
const router = express.Router()

const { getTicketRouter } = require('./ticketRouter')


module.exports = function initRouter(indexer) {
    router.use('/ticket/', getTicketRouter(indexer));
    return router;
}
