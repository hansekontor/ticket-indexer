'use strict';

const TicketIndexer = require('./indexer/ticketindexer');

module.exports = class IndexerPlugin {
    constructor(options) {
		this.ticketIndexer = new TicketIndexer(options);
    }
}
