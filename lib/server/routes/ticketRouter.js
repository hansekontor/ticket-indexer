// All main ticket routes

const express = require('express');
const router = express.Router();

const { getTicketsByAddress } = require('../controllers/ticketController');
const { rollbackIndexer } = require('../controllers/ticketController');

module.exports = {
    getTicketRouter(indexer) {
        router.get('/address/:addr', getTicketsByAddress(indexer));
        router.get('/rollback/:height', rollbackIndexer(indexer));
        
        return router;
    }
}
