// All main ticket routes

const express = require('express');
const router = express.Router();

const { 
	getTicketDataByAddress, 
	getTicketsByHeight, 
	getIssueTx,
	rollbackIndexer 
} = require('../controllers/ticketController');

module.exports = {
    getTicketRouter(indexer) {
        router.get('/address/:address', getTicketDataByAddress(indexer));
		router.get('/height/:height', getRedeemedByHeight(indexer));
        router.get('/issue/:hash', getIssueTx(indexer));
		router.get('/rollback/:height', rollbackIndexer(indexer));
        
        return router;
    }
}
