/*!
 * indexer.js - ticket indexer for bcoin
 * Copyright (c) 2024, Olav (MIT License).
 */

'use strict';

const bdb = require('bdb');
const bcash = require('bcash');
const {
	Indexer,
    BlockMeta, 
	Block, 
	CoinView, 
} = bcash;
const { U64 } = require('n64');
const assert = require('assert');
const bio = require('bufio');

const layout = require('./layout');
const { 
	Count, 
	BlockRecord 
} = require('./records');
const validateIssueTx = require('./validation');
/*
 *	Address
 *  M[addr-prefix][addr-hash][height][index] -> dummy (issue tx by address)
 * 	N[addr-prefix][addr-hash][height][index] -> dummy (redeem tx by address)
 *  C[height][index] -> hash (tx hash by height and index)
 *  c[hash]-> height + index (tx height and index by hash)
 * 
 *  Issue Tx
 * 	d[issue hash] -> hash index
 * 	D[hash index] -> issue hash
 * 	I[height] -> hash index
 * 	
 * 	Redeem Tx
 * 	e[redeem hash] -> hash index
 * 	E[hash index] -> redeem hash
 * 	r[issue hash index] -> redeem hash index
 * 	P[height] -> redeem hash index
 * 	
 * 	Block Header
 * 	B[block hash] -> block header
 * 	
 * 	Block (already included in standard layout)
 * 	h[height] -> block hash
 * 
*/

// add ticketindex layout 
Object.assign(layout, {
	M: bdb.key('M', ['uint8', 'hash', 'uint32', 'uint32']),
	N: bdb.key('N', ['uint8', 'hash', 'uint32', 'uint32']),
	C: bdb.key('C', ['uint32', 'uint32']),
	c: bdb.key('c', ['hash256']),
	D: bdb.key('D', ['uint32']),
	d: bdb.key('d', ['hash256']),
	I: bdb.key('I', ['uint32']),
	E: bdb.key('E', ['uint32']),
	e: bdb.key('e', ['hash256']),
	P: bdb.key('P', ['uint32']),
	r: bdb.key('r', ['uint32']),
	B: bdb.key('B', ['hash256'])
  });

/**
 * Increment 32-bit big endian
 * @param {Buffer} hashIndBuf
 * @returns {Buffer}
 */
function incrementUInt32BE (hashIndBuf) {
	assert(hashIndBuf.length == 4, 'Buffer length must be 4 bytes')

	const newNumData = Buffer.alloc(4);
	const hashIndNum = U64.readBE(hashIndBuf, -4).addn(1);
	assert(hashIndNum.lte(U64.UINT32_MAX), 'Increment limit reached for UInt32')

	hashIndNum.writeBE(newNumData, -4);
	return newNumData
}

/**
 * 32-bit big endian to Number (int)
 * @param {Buffer} hashIndBuf
 * @returns {Number}
 */
function uInt32BEToInt (hashIndBuf) {
	assert(hashIndBuf.length == 4, 'Buffer length must be 4 bytes');
  
	const hashIndInt = U64.readBE(hashIndBuf, -4).toInt();
	assert(typeof hashIndInt == 'number');
  
	return hashIndInt;
  }



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

	  this.db = bdb.create(this.options);
    }
  
    /**
     * Index tickets.
     * @private
     * @param {BlockMeta} meta
     * @param {Block} block
     * @param {CoinView} view
     */
  
    async indexBlock(meta, block, view) {
		assert(block.hasRaw(), 'Expected raw data for block.');

		// skip blocks prior to first issue tx
		const height = meta.height;		
		if (height < 866600) {
			console.log(`${height} below treshold`);
			return;
		}

		const bblock = block.txs[0]._block ? block : Block.fromRaw(block.toRaw());
		let issuebrecord, redeembrecord;

		// iterate through block's txs
        for (let i = 0; i < bblock.txs.length; i++) {
            const tx = bblock.txs[i];

			// check if it is a redeem tx
			const validRedeemTx = await this.validateRedeemTx(tx);

			if (validRedeemTx) {
				// index redeem hash 
				const lastHashIndex = await this.getLastHashIndex(meta.height);
				redeembrecord = new BlockRecord({
					start: lastHashIndex,
					last: lastHashIndex
				});
				  
				const redeemHash = tx.hash();
				const redeemHashIndex = this.getHashIndex(redeemHash, redeembrecord);
				const redeemHashIndexInt = uInt32BEToInt(redeemHashIndex);
				if (redeemHashIndexInt > redeembrecord.last) {
					redeembrecord.last = redeemHashIndexInt;
				}
			

				const issueHash = tx.inputs[0].prevout.hash;
				const issueHashIndex = this.getHashIndex(issueHash, redeembrecord);


				await this.db.put(layout.E.encode(redeemHashIndex), hash);
				await this.db.put(layout.e.encode(redeemHash), redeemHashIndex);
				await this.db.put(layout.r.encode(issueHashIndex), redeemIndex);

				redeemTxToAdd.push(redeemHashIndex);

				// index redeem hash by address
				const count = new Count(height, i);
				let hasAddress = false;
				// this is false:
				const payoutAddresses = tx.getAddresses();
				for (const addr of payoutAddresses) {
					const prefix = addr.getPrefix(this.network);
			
					if (prefix < 0)
						continue;
			
					const addrHash = addr.getHash();
			
					this.db.put(layout.N.encode(prefix, addrHash, height, i), null);

					hasAddress = true;
				}
			
				if (hasAddress) {
					await this.db.put(layout.C.encode(height, i), hash);
					await this.db.put(layout.c.encode(hash), count.toRaw());
				}

				// delete issue hash by address
				await this.db.del(layout.M.encode(prefix, addrHash, issueHeight, issueIndex));
				await this.db.del(layout.D.encode(issueHashIndex))
				await this.db.del(layout.d.encode(issueHash))
			} else {
				const validIssueTx = await validateIssueTx(tx);
				if (!validIssueTx) {
					console.log("Invalid Issue Tx");
					continue;
				}
						
				const lastHashIndex = await this.getLastHashIndex(meta.height);
				const issuebrecord = new BlockRecord({
					start: lastHashIndex,
					last: lastHashIndex
				});
				  
				const issueHash = tx.hash();
				const issueHashIndex = this.getHashIndex(issueHash, issuebrecord);
				const issueHashIndexInt = uInt32BEToInt(issueHashIndex);
				if (issueHashIndexInt > issuebrecord.last) {
					issuebrecord.last = issueHashIndexInt;
				}

				await this.db.put(layout.D.encode(issueHashIndex), issueHash);
				await this.db.put(layout.d.encode(issueHash), issueHashIndex);

				// index issue hash by address
				const count = new Count(height, i);
				let hasAddress = false;
				const payoutAddresses = validIssueTx.addresses;
				for (const addr of payoutAddresses) {
				  const prefix = addr.getPrefix(this.network);
		  
				  if (prefix < 0)
					continue;
		  
				  const addrHash = addr.getHash();
		  
				  this.db.put(layout.M.encode(prefix, addrHash, height, i), null);

				  hasAddress = true;
				}
		  
				if (hasAddress) {
				  this.db.put(layout.C.encode(height, i), issueHash);
				  this.db.put(layout.c.encode(issueHash), count.toRaw());
				}
			}				
		}			
		
		// index hash indices by block
		if (issuebrecord) {
			this.db.put(layout.I.encode(meta.height), issuebrecord.toRaw());
		}
		if (redeembrecord) {
			this.db.put(layout.P.encode(meta.height), redeembrecord.toRaw());
		}

		// index block header 
		this.db.put(layout.B.encode(blockHash), blockHeader);		
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

	/**
	 * 
	 * @param {TX} tx 
	 * @returns {Boolean} validRedeemTx
	 */
	async validateRedeemTx(tx) {
		const prevoutHash = tx.inputs[0].prevout.hash;
		const issueHashIndex = await this.db.get(layout.d.encode(prevoutHash))

		const hasPreviousIssueTx = issueHashIndex ? true : false;

		return hasPreviousIssueTx;
	}

	/**
   * Get last transaction hash index used in the most recently indexed block
   * @param {Number} currentHeight height of current block being indexed
   * @param {String} type - either "issue" or "redeem" type to access relevant db
   * @returns {Promise} - Returns UInt32 buffer representing last hash index
   */
	async getLastIssueHashIndex(height, type) {
		assert(type == 'issue' || type == 'redeem', "type must be either 'issue' or 'redeem'");

		const prevHeight = height && height > 0 ? height - 1 : 0;
		let prevBlockDb;
		if (type === 'issue')
			prevBlockDb = await this.db.get(layout.I.encode(prevHeight));
		else
			prevBlockDb = await this.db.get(layout.P.encode(prevHeight));

		if (!prevBlockDb)
		  return Buffer.alloc(4, 0x00);
	
		const prevBlockRecord = BlockRecord.fromRaw(prevBlockDb);
		return prevBlockRecord.last
	}


	/**
	 * Get new hash index or already existent one
	 * @param {Buffer} hash 
	 * @param {*} brecord 
	 * @returns 
	 */
	async getHashIndex(hash, brecord) {
		// Check if hash index is already in db
		const hashIndex = await this.db.get(layout.d.encode(hash));
		// If exists, return the int. overwrite/replace if out of bounds
		if(hashIndex) {
			if (uInt32BEToInt(hashIndex) <= uInt32BEToInt(brecord.start))
			return hashIndex;
		}
		// If it doesn't exist, increment last used index and return value
		return incrementUInt32BE(brecord.last);
	}


}
  
  module.exports = TicketIndexer;
