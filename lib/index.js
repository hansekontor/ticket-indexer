'use strict';

const TicketIndexer = require('./indexer/ticketindexer');
const Server = require('./server/bin/www');

module.exports = class IndexerPlugin {
    constructor(options) {
		this.ticketIndexer = new TicketIndexer(options);
		this.server = new Server();
    }
}
