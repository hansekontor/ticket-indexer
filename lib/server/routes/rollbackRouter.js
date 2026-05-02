// Rollback route

const express = require('express');
const router = express.Router();

const { 
    rollbackIndexer
} = require('../controllers/rollbackController');

module.exports = {
    getRollbackRouter(indexer) {
        router.get('/:height', rollbackIndexer(indexer));

        return router;
    }
}