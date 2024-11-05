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
	Address
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
	// console.log("incrementUINT32BE with hashIndBuf", hashIndBuf);
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
	// console.log("uInt32ToInt with hashIndBuf", hashIndBuf);
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
	  this.txindex = options.txindex;
	//   this.slpindex = options.slpindex;
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
				const lastHashIndex = await this.getLastHashIndex(meta.height, "redeem");
				redeembrecord = new BlockRecord({
					start: lastHashIndex,
					last: lastHashIndex
				});
				  
				const redeemHash = tx.hash();
				const redeemHashIndex = await this.getHashIndex(redeemHash, redeembrecord);
				const redeemHashIndexInt = uInt32BEToInt(redeemHashIndex);
				if (redeemHashIndexInt > redeembrecord.last) {
					redeembrecord.last = redeemHashIndexInt;
				}
			
				const issueHash = tx.inputs[0].prevout.hash;
				const issueHashIndex = await this.getHashIndex(issueHash, redeembrecord);
				const issueHashIndexInt = uInt32BEToInt(issueHashIndex);

				await this.db.put(layout.E.encode(redeemHashIndexInt), redeemHash);
				await this.db.put(layout.e.encode(redeemHash), redeemHashIndex);
				await this.db.put(layout.r.encode(issueHashIndexInt), redeemHashIndex);

				// index redeem hash by address
				const count = new Count(height, i);
				let hasAddress = false;
				// this is false:
				const payoutAddresses = tx.getAddresses(view);
				// console.log("redeem payoutAddresses", payoutAddresses);
				for (const addr of payoutAddresses) {
					// console.log("addr for N", addr);
					const prefix = addr.getPrefix(this.network.type);
					// console.log("prefix for N", prefix);			
					if (prefix < 0)
						continue;
			
					const addrHash = addr.getHash();
					// console.log("index put N");
					this.db.put(layout.N.encode(prefix, addrHash, height, i), null);
					// console.log("index del M");
					
					// delete issue hash by address
					await this.db.del(layout.M.encode(prefix, addrHash, height, i));
					hasAddress = true;
				}
			
				if (hasAddress) {
					// console.log("index address helpers");
					// replace hashes by hash indices
					await this.db.put(layout.C.encode(height, i), redeemHash);
					await this.db.put(layout.c.encode(redeemHash), count.toRaw());
				}

				// delete issue hash
				// console.log("index del D");
				await this.db.del(layout.D.encode(issueHashIndexInt));
				// console.log("index del d");
				await this.db.del(layout.d.encode(issueHash))
			} else {
				const validIssueTx = await validateIssueTx(tx);
				if (!validIssueTx) {
					console.log("Invalid Issue Tx");
					continue;
				}
						
				const lastHashIndex = await this.getLastHashIndex(meta.height, "issue");
				const issuebrecord = new BlockRecord({
					start: lastHashIndex,
					last: lastHashIndex
				});
				  
				const issueHash = tx.hash();
				const issueHashIndex = await this.getHashIndex(issueHash, issuebrecord);
				const issueHashIndexInt = uInt32BEToInt(issueHashIndex);
				if (issueHashIndexInt > issuebrecord.last) {
					issuebrecord.last = issueHashIndexInt;
				}

				// console.log("index put D, issueHashIndex", issueHashIndex);
				await this.db.put(layout.D.encode(issueHashIndexInt), issueHash);
				// console.log("index put d");
				await this.db.put(layout.d.encode(issueHash), issueHashIndex);

				// index issue hash by address
				const count = new Count(height, i);
				// console.log("count", count);
				let hasAddress = false;
				// console.log("validIssueTx", validIssueTx);
				const payoutAddresses = validIssueTx.addresses.map(item => item.address);
				// console.log("payoutAddresses", payoutAddresses);
				for (const addr of payoutAddresses) {
					// console.log("addr for M", addr);
				 	const prefix = addr.getPrefix(this.network);
					// console.log("prefix for M", prefix);		  
				  	if (prefix < 0)
						continue;
		  
				  	const addrHash = addr.getHash();
					// console.log("index put M");		  
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
			// console.log("index I");
			this.db.put(layout.I.encode(meta.height), issuebrecord.toRaw());
		}
		if (redeembrecord) {
			// console.log("index P");
			this.db.put(layout.P.encode(meta.height), redeembrecord.toRaw());
		}

		// index block header 
		const blockHeader = bblock.toHeaders();
		// console.log("index B");
		this.db.put(layout.B.encode(bblock.hash()), blockHeader.toRaw());		
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
	async getLastHashIndex(height, type) {
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
		// console.log("getHashIndex() with hash", hash, "brecord", brecord);
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

	async getMetaByAddress(addr, type) {
		const meta = await this.getRedeemMetaByAddress(addr);

		return meta;
	}

	/**
	 * 
	 * @param {Address} address 
	 * @returns {Promise} - issue hashess
	 */
	async getIssueHashesByAddress(addr) {
		const after = false;
		const reverse = true;
		// const {after, reverse} = options;
		// let {limit} = options;
		let limit = 100;
	
		if (!limit)
		  limit = this.maxTxs;
	
		if (limit > this.maxTxs)
		  throw new Error(`Limit above max of ${this.maxTxs}.`);
	
		const hash = Address.getHash(addr);
		const prefix = addr.getPrefix(this.network.type);
	
		let opts = {
			limit, 
			reverse,
			parse: (key) => {
				const [,, height, index] = layout.M.decode(key);
				return [height, index];
			}
		};
	
		// Determine if the hash -> height + index mapping exists.
		const hasAfter = (after && await this.db.has(layout.c.encode(after)));
	
		// Check to see if results should be skipped because
		// the after hash is expected to be within a following
		// mempool query.
		const skip = (after && !hasAfter && !reverse);
		if (skip)
		  	return [];
	
		if (after && hasAfter) {
			// Give results starting from after
			// the tx hash for the address.
			const raw = await this.db.get(layout.c.encode(after));
			const count = Count.fromRaw(raw);
			const {height, index} = count;
		
			if (!reverse) {
				opts.gt = layout.M.min(prefix, hash, height, index);
				opts.lte = layout.M.max(prefix, hash);
			} else {
				opts.gte = layout.M.min(prefix, hash);
				opts.lt = layout.M.max(prefix, hash, height, index);
			}
		} else {
		  // Give earliest or latest results
		  // for the address.
		  opts.gte = layout.M.min(prefix, hash);
		  opts.lte = layout.M.max(prefix, hash);
		}
	
		const txs = await this.db.keys(opts);
		const hashes = [];
	
		for (const [height, index] of txs)
		  hashes.push(await this.db.get(layout.C.encode(height, index)));
	
		return hashes;
	}

	/**
	 * 
	 * @param {Address} address 
	 * @returns {Promise} - redeem hashess
	 */
	async getRedeemHashesByAddress(addr) {
		const after = false;
		const reverse = true;
		// const {after, reverse} = options;
		// let {limit} = options;
		let limit = 100;
	
		if (!limit)
			limit = this.maxTxs;
	
		if (limit > this.maxTxs)
			throw new Error(`Limit above max of ${this.maxTxs}.`);
	
		const hash = Address.getHash(addr);
		const prefix = addr.getPrefix(this.network.type);
	
		let opts = {
			limit, 
			reverse,
			parse: (key) => {
				const [,, height, index] = layout.N.decode(key);
				return [height, index];
			}
		};
	
		// Determine if the hash -> height + index mapping exists.
		const hasAfter = (after && await this.db.has(layout.c.encode(after)));
	
		// Check to see if results should be skipped because
		// the after hash is expected to be within a following
		// mempool query.
		const skip = (after && !hasAfter && !reverse);
		if (skip)
				return [];
	
		if (after && hasAfter) {
			// Give results starting from after
			// the tx hash for the address.
			const raw = await this.db.get(layout.c.encode(after));
			const count = Count.fromRaw(raw);
			const {height, index} = count;
		
			if (!reverse) {
				opts.gt = layout.N.min(prefix, hash, height, index);
				opts.lte = layout.N.max(prefix, hash);
			} else {
				opts.gte = layout.N.min(prefix, hash);
				opts.lt = layout.N.max(prefix, hash, height, index);
			}
		} else {
			// Give earliest or latest results
			// for the address.
			opts.gte = layout.N.min(prefix, hash);
			opts.lte = layout.N.max(prefix, hash);
		}
	
		const txs = await this.db.keys(opts);
		const hashes = [];
	
		for (const [height, index] of txs)
			hashes.push(await this.db.get(layout.C.encode(height, index)));
	
		return hashes;
	}
	
	async getRedeemMetaByAddress(addr) {
		const reverse = false;
		const after = false;
		const limit = 100;
		//   const {reverse, after} = options;
		//   let {limit} = options;
	  
		let metas = [];
	
		const confirmed = async () => {
			const hashes = await this.getRedeemHashesByAddress(addr);
	
			for (const hash of hashes) {
				const mtx = await this.txindex.getMeta(hash);
				assert(mtx);
				metas.push(mtx);
			}
		};
	  
		//   const unconfirmed = () => {
		// 		const mempool = this.mempool.getMetaByAddress(
		// 			addr, {limit, reverse, after});
		
		// 		metas = metas.concat(mempool);
		//   };
	  
		//   if (reverse)
		// 		unconfirmed();
		//   else
		await confirmed();
	  
		// if (limit && metas.length > 0)
		// 	limit -= metas.length;
	  
		// If more transactions can still be added
		// if (!limit || limit > 0) {
		// 	if (reverse)
			  	// await confirmed();
		// 	else
		// 	  unconfirmed();
		//   }
	  
		// add this again
		// for (let i = 0; i < metas.length; i++) {
		// 	metas[i].tx = await this.addSlpInfoToTx(metas[i].tx)
		// }
	  
		return metas;
	}


}
  
  module.exports = TicketIndexer;
