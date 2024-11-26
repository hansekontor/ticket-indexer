'use strict';

const TicketIndexerPlugin = require('./index');
const Server = require('./server/bin/www');

const plugin = exports;

class Plugin extends TicketIndexerPlugin {
	constructor(node) {
		// set options here 
		const options = {
            network: node.network.type,
            logger: node.logger,
            blocks: node.blocks,
            chain: node.chain,
            prune: node.config.bool('prune'),
            memory: node.memory,
            prefix: node.config.str('index-prefix', node.config.prefix),
            txindex: node.txindex,
            slpindex: node.slpindex,
			mempool: node.mempool,
        };

		super(options);
	}

	async open() {
		this.ticketIndexer.open().then(
			this.server = new Server(this.ticketIndexer)
		);
	}
}

plugin.id = "ticket-indexer";

plugin.init = function init(node) {
	return new Plugin(node);
}