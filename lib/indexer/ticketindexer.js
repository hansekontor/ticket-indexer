/*!
 * indexer.js - ticket indexer for bcoin
 * Copyright (c) 2024, Olav (MIT License).
 */

'use strict';

const layout = require('./layout');
const bcash = require('bcash');
const {
	Indexer,
    BlockMeta, 
	Block, 
	CoinView, 
} = bcash;



/**
 * TicketIndexer
 * @alias module:indexer.TicketIndexer
 * @extends Indexer
 */

class TicketIndexer extends Indexer {
    /**
     * Create a indexer
     * @constructor
     * @param {Object} options
     */
  
    constructor(options) {
      super('ticket', options);
    }
  
    /**
     * Index transactions by address.
     * @private
     * @param {BlockMeta} meta
     * @param {Block} block
     * @param {CoinView} view
     */
  
    async indexBlock(meta, block, view) {
		console.log("TICKETINDEXER indexBlock()");
    }
  
    /**
     * Remove addresses from index.
     * @private
     * @param {BlockMeta} meta
     * @param {Block} block
     * @param {CoinView} view
     */
  
    async unindexBlock(meta, block, view) {
    }
}
  
  module.exports = TicketIndexer;
