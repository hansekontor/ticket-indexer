'use strict';

const TicketIndexer = require('./indexer/ticketindexer');
const Server = require('./server');

module.exports = class IndexerPlugin {
    constructor(options) {
		this.ticketIndexer = new TicketIndexer("ticket-indexer", options);
		this.server = new Server();
    }
}
