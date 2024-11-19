// All main ticket routes

const express = require('express');
const router = express.Router();

const { 
	getTicketsByAddress, 
	getTicketsByHeight, 
	getIssueTx,
	rollbackIndexer 
} = require('../controllers/ticketController');

module.exports = {
    getTicketRouter(indexer) {
        router.get('/address/:addr', getTicketsByAddress(indexer));
		router.get('/height/:height', getTicketsByHeight(indexer));
        router.get('/issue/:hash', getIssueTx(indexer));
		router.get('/rollback/:height', rollbackIndexer(indexer));
        
        return router;
    }
}
