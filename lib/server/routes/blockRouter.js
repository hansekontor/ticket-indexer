// All main block routes

const express = require('express');
const router = express.Router();

const { getBlockHeader } = require('../controllers/blockController');

module.exports = {
    getBlockRouter(indexer) {
		router.get('/header/:height', getBlockHeader(indexer));

		return router;
    }
}
