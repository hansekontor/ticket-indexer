// All main ticket routes

const express = require('express');
const router = express.Router();

const { 
	getTicketDataByAddress, 
	getRedeemTxByIssueHash,
	rollbackIndexer 
} = require('../controllers/ticketController');

module.exports = {
    getTicketRouter(indexer) {
        router.get('/address/:address', getTicketDataByAddress(indexer));
        router.get('/redeemed/:hash', getRedeemTxByIssueHash(indexer));
		router.get('/rollback/:height', rollbackIndexer(indexer));
        
        return router;
    }
}
