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
	Address,
	Coin,
	TXMeta,
	MTX,
	util
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
 * 	I[height] -> block record
 * 	
 * 	Redeem Tx
 * 	e[redeem hash] -> hash index
 * 	E[hash index] -> redeem hash
 * 	r[issue hash] -> redeem hash index
 * 	P[height] -> block record
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
	// console.log("newNumData", newNumData);
	const hashIndNum = U64.readBE(hashIndBuf, -4).addn(1);
	// console.log("hashIndNum", hashIndNum);
	assert(hashIndNum.lte(U64.UINT32_MAX), 'Increment limit reached for UInt32')

	hashIndNum.writeBE(newNumData, -4);
	// console.log("hashIndNum", hashIndNum);
	// console.log("returning newNumData", newNumData);
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
		this.slpindex = options.slpindex;
		this.mempool = options.mempool;
		this.chain = options.chain;
		this.maxTxs = 100;
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
			// console.log(`${height} below treshold`);
			return;
		}

		const bblock = block.txs[0]._block ? block : Block.fromRaw(block.toRaw());
		const lastIssueHashIndex = await this.getLastHashIndex(meta.height, "issue");
		const lastRedeemHashIndex = await this.getLastHashIndex(meta.height, "redeem");
		let issuebrecord = new BlockRecord({
			start: lastIssueHashIndex,
			last: lastIssueHashIndex
		});
		let redeembrecord = new BlockRecord({
			start: lastRedeemHashIndex,
			last: lastRedeemHashIndex
		});

		// iterate through block's txs
        for (let i = 0; i < bblock.txs.length; i++) {
            const tx = bblock.txs[i];

			// check if it is a redeem tx
			const validRedeemTx = await this.validateRedeemTx(tx);
			if (validRedeemTx) {
				// console.log("validRedeemTx at", tx.rhash());
				// index redeem hash 
				const redeemHash = tx.hash();
				const redeemHashIndex = await this.getHashIndex(redeemHash, redeembrecord);
				// console.log("redeemHashIndex", redeemHashIndex);
				const redeemHashIndexInt = uInt32BEToInt(redeemHashIndex);
				// console.log("redeemHashIndexInt", redeemHashIndexInt);
				const lastRedeemHashIndexInt = uInt32BEToInt(redeembrecord.last);
				console.log("lastRedeemHashIndexInt", lastRedeemHashIndexInt);
				console.log("replace hash?", redeemHashIndexInt > lastRedeemHashIndexInt);
				if (redeemHashIndexInt > lastRedeemHashIndexInt) {
					redeembrecord.last = redeemHashIndex;
				}
			
				const issueHash = tx.inputs[0].prevout.hash;
				const issueHashIndex = await this.db.get(layout.d.encode(issueHash));
				const issueHashIndexInt = uInt32BEToInt(issueHashIndex);
				const issueMeta = await this.txindex.getMeta(issueHash);


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
					await this.db.del(layout.M.encode(prefix, addrHash, issueMeta.height, issueMeta.index));
					hasAddress = true;
				}
			
				if (hasAddress) {
					// console.log("index address helpers");
					// replace hashes by hash indices
					// is this necessary?
					await this.db.put(layout.C.encode(height, i), redeemHash);
					await this.db.put(layout.c.encode(redeemHash), count.toRaw());
				}

			} else {
				const validIssueTx = await validateIssueTx(tx);
				if (!validIssueTx) {
					//console.log("Invalid Issue Tx");
					continue;
				}
				console.log("valid issue tx with hash", tx.hash());	
				const issueHash = tx.hash();
				const issueHashIndex = await this.getHashIndex(issueHash, issuebrecord);
				const issueHashIndexInt = uInt32BEToInt(issueHashIndex);
				if (issueHashIndexInt > uInt32BEToInt(issuebrecord.last)) {
					issuebrecord.last = issueHashIndex;
				}

				//console.log("put D","key", issueHashIndexInt, "value", issueHash);
				await this.db.put(layout.D.encode(issueHashIndexInt), issueHash);
				//console.log("put d", "key", issueHash, "value", issueHashIndex);
				await this.db.put(layout.d.encode(issueHash), issueHashIndex);

				// index issue hash by address
				const count = new Count(height, i);
				// console.log("count", count);
				let hasAddress = false;
				// console.log("validIssueTx", validIssueTx);
				const payoutAddresses = validIssueTx;
				//console.log("payoutAddresses", payoutAddresses);
				for (const addr of payoutAddresses) {
					// console.log("addr for M", addr);
				 	const prefix = addr.getPrefix(this.network);
					// console.log("prefix for M", prefix);		  
				  	if (prefix < 0)
						continue;
		  
				  	const addrHash = addr.getHash();
					//console.log("index put M");		  
					this.db.put(layout.M.encode(prefix, addrHash, height, i), null);

					hasAddress = true;
				}
		  
				if (hasAddress) {
					this.db.put(layout.C.encode(height, i), issueHash);
					this.db.put(layout.c.encode(issueHash), count.toRaw());
				}
			}				
		}			
		
		// indexs issue brecord
		console.log("put I", "key", meta.height, "value", issuebrecord.toRaw());
		this.db.put(layout.I.encode(meta.height), issuebrecord.toRaw());

		// index block header
		const blockHeader = bblock.toHeaders();
		console.log("put blockHeader", blockHeader);
		console.log("key", bblock.hash(), "value", blockHeader.toRaw());
		this.db.put(layout.B.encode(bblock.hash()), blockHeader.toRaw());

		// index redeem brecord
		console.log("put P", "key", meta.height, "value", redeembrecord.toRaw());
		this.db.put(layout.P.encode(meta.height), redeembrecord.toRaw());
	}
  
    /**
     * Remove addresses from index.
     * @private
     * @param {BlockMeta} meta
     * @param {Block} block
     * @param {CoinView} view
     */
    async unindexBlock(meta, block, view) {
		// issue txs can simply be deleted
		const rawIssueBrecord = await this.db.get(layout.I.encode(meta.height));
		if (rawIssueBrecord) {
			const issueBrecord = BlockRecord.fromRaw(rawIssueBrecord);

			// iterate through hash indexes in block record
			for (let i = 1 + uInt32BEToInt(issueBrecord.start); i <= uInt32BEToInt(issueBrecord.last); i++) {

				// delete hash index <-> hash entries
				const issueHashIndexInt = i;
				const issueHash = await this.db.get(layout.D.encode(issueHashIndexInt));
				
				await this.db.del(layout.d.encode(issueHash));
				await this.db.del(layout.D.encode(issueHashIndexInt));

				// delete address entries
				const issueMeta = await this.txindex.getMeta(issueHash);
				const issueTx = MTX.fromOptions(issueMeta.tx);
				const validIssueTx = await validateIssueTx(issueTx);
				const payoutAddresses = validIssueTx;
				for (const addr of payoutAddresses) {
					const prefix = addr.getPrefix(this.network.type);
					if (prefix < 0)
						continue;
		
					const addrHash = addr.getHash();
					console.log("del M", prefix, addrHash, meta.height, i);				
					this.db.del(layout.M.encode(prefix, addrHash, meta.height, i));
				}			
			}

			// delete issue block record
			this.db.del(layout.I.encode(meta.height));
		}

		// redeem txs can be deleted after re-indexing the respective issue tx in address table M
		const rawRedeemBrecord = await this.db.get(layout.P.encode(meta.height));
		if (rawRedeemBrecord) {
			const redeemBrecord = BlockRecord.fromRaw(rawRedeemBrecord);
			const numberOfRedeemTxs = uInt32BEToInt(redeemBrecord.last) - uInt32BEToInt(redeemBrecord.start);
			for (let i = 1; i <= numberOfRedeemTxs; i++) {
				const redeemHashIndexInt = i + uInt32BEToInt(redeemBrecord.start);
				const redeemHash = await this.db.get(layout.E.encode(redeemHashIndexInt));
				const redeemMeta = await this.txindex.getMeta(redeemHash);
				const redeemInputScript = redeemMeta.tx.inputs[0].script;
				const rawIssueTx = redeemInputScript.getData(5);
				const issueTx = MTX.fromRaw(rawIssueTx);
				const issueHash = issueTx.hash();
				const issueMeta = await this.txindex.getMeta(issueHash);

				// re-index tx dummy by address and delete redeem
				// do later: replace the next step by something more efficient
				const validIssueTx = await validateIssueTx(issueTx);
				const payoutAddresses = validIssueTx;
				for (const addr of payoutAddresses) {
					const prefix = addr.getPrefix(this.network.type);
					if (prefix < 0)
						continue;
		
					const addrHash = addr.getHash();
					console.log("put M", prefix, addrHash, issueMeta.height, issueMeta.index);
					this.db.put(layout.M.encode(prefix, addrHash, issueMeta.height, issueMeta.index), null);
					console.log("del N", prefix, addrHash, meta.height, i);
					this.db.del(layout.N.encode(prefix, addrHash, meta.height, i));
				}			

				// delete in hash index <-> hash tables
				this.db.del(layout.e.encode(redeemHash));
				this.db.del(layout.E.encode(redeemHashIndexInt));

				// delete in issue <-> redeem table
				this.db.del(layout.r.encode(redeemHashIndexInt));

			}
			
			// delete redeem block record
			this.db.del(layout.P.encode(meta.height));
		}

		// delete block header
		this.db.del(layout.B.encode(block.hash()));
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

		console.log("prevBlockDb", prevBlockDb);

		if (!prevBlockDb)
		  return Buffer.alloc(4, 0x00);
	
		const prevBlockRecord = BlockRecord.fromRaw(prevBlockDb);
		console.log("prevBlockRecord", prevBlockRecord);
		
		return prevBlockRecord.last
	}

	/**s
	 * Get new hash index or already existent one
	 * @param {Buffer} hash 
	 * @param {*} brecord 
	 * @returns 
	 */
	async getHashIndex(hash, brecord, type) {
		// console.log("getHashIndex() with hash", hash, "brecord", brecord);
		// Check if hash index is already in db
		let hashIndex;
		if (type==="issue") {
			 hashIndex = await this.db.get(layout.d.encode(hash));
		} else {
			hashIndex = await this.db.get(layout.e.encode(hash));
		}
		// console.log("hashIndex", hashIndex);
		// If exists, return the int. overwrite/replace if out of bounds
		if(hashIndex) {
			if (uInt32BEToInt(hashIndex) <= uInt32BEToInt(brecord.start)) {
				return hashIndex;
			}
		}
		console.log("returning incremented hash index", incrementUInt32BE(brecord.last));
		// If it doesn't exist, increment last used index and return value
		return incrementUInt32BE(brecord.last);
	}

	async getTxsByAddress(addr) {
		if (typeof addr === "string")
			addr = new Address(addr);

		const limit = this.maxTxs;
		let metas;
		metas = await this.getMetaByAddress(addr, 'issue');
		const redeemTxsLimit = metas.length > limit ? false : limit - metas.length;
		if (redeemTxsLimit) {
			const redeemMetas = await this.getMetaByAddress(addr, 'redeem', redeemTxsLimit);
			metas = metas.concat(redeemMetas);
		}
		let metasJson = [];
		for (const meta of metas) {
			const metaJson = await this.getMetaJson(meta);
			metasJson.push(metaJson);
		};

		return metasJson;
	}

	/**
	 * 
	 * @param {Address} address 
	 * @returns {Promise} - issue hashess
	 */
	async getIssueHashesByAddress(addr, limit) {
		const after = false;
		const reverse = true;
		// const {after, reverse} = options;
		// let {limit} = options;
	
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
	async getRedeemHashesByAddress(addr, limit) {
		const after = false;
		const reverse = true;
		// const {after, reverse} = options;
		// let {limit} = options;
	
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
	
	async getMetaByAddress(addr, type, limit = 100) {
		const reverse = false;
		const after = false;
		//   const {reverse, after} = options;
		//   let {limit} = options;
	  
		let metas = [];
	
		const confirmed = async () => {
			let hashes;
			if (type === "issue") 
				hashes = await this.getIssueHashesByAddress(addr);
			else 
				hashes = await this.getRedeemHashesByAddress(addr, limit);
	
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
	  
		// add slp info
		for (let i = 0; i < metas.length; i++) {
			metas[i].tx = await this.addSlpInfoToTx(metas[i].tx)
		}
	  
		return metas;
	}

	async getHashesByHeight(range) {
		const count = range.end - range.start + 1;
		const heights = Array.from({length: count}, (_,i) => i+1)
			.map(value => value + range.start - 1);
		// const metasByHeight = [];
		const hashesByHeight = [];

		for (const height of heights) {

			// get brecord for height
			const rawbrecord = await this.db.get(layout.P.encode(height));
			if (!rawbrecord) 
				continue;
			const brecord = BlockRecord.fromRaw(rawbrecord);

			// brecords with start=last are empty
			const txCount = uInt32BEToInt(brecord.last) - uInt32BEToInt(brecord.start);
			const hasNewTxs = txCount > 0;
			if (!hasNewTxs)
				continue;

			// get all hash indexes for height
			const opts = {
				gte: layout.E.min(uInt32BEToInt(brecord.start) + 1),
				lte : layout.E.max(uInt32BEToInt(brecord.last)),
				parse: (key) => {
					const hashIndex = layout.E.decode(key);
					return hashIndex;
				},
			};
			const hashIndexes = await this.db.keys(opts);
			// get all hashes for height
			// const hashes = [];
			const revHexHashes = [];
			for (const hashIndex of hashIndexes) {
				const hash = await this.db.get(layout.E.encode(hashIndex[0]));
				// hashes.push(hash);
				const revHexHash = util.revHex(hash).toString('hex');
				revHexHashes.push(revHexHash);
			}
			// // get all tx metas for height
			// const metas = [];
			// for (const hash of hashes) {
			// 	const meta = await this.txindex.getMeta(hash);
			// 	metas.push(meta);
			// }

			// // add slp info
			// for (let i = 0; i > metas.length; i++) {
			// 	metas[i].tx = await this.addSlpInfoToTx(metas[i].tx);
			// }

			// // add metajson
			// let metasJson = [];
			// for (const meta of metas) {
			// 	const metaJson = await this.getMetaJson(meta);
			// 	metasJson.push(metaJson);
			// }

			// metasByHeight.push({
			// 	height, 
			// 	txs: metasJson,
			// });

			hashesByHeight.push({
				height, 
				hashes: revHexHashes,
			});
		}	

		return hashesByHeight;
	}
	
	async getTokenUtxosByAddress(addr) {
		const slp = true;  
		const address = Address.fromString(addr);
		const addressString = addr;

		const coins = [];

		const memCoins = await this.mempool.getCoinsByAddress(addressString);
		for (const coin of memCoins) {
			const slpCoin = await this.addSlpInfoToCoin(coin);
			coins.push(slpCoin);
		}
	
		const blockCoins = await this.chain.getCoinsByAddress(addressString);
		for (const coin of blockCoins) {
			const spentTx = this.mempool.getSpentTX(coin.hash, coin.index);
			if (!spentTx)  {
				const slpCoin = await this.addSlpInfoToCoin(coin);
				coins.push(slpCoin);
				
				// add token filter here
			}
		}
  
		return coins;
	}

	async getBlockHeader(height) {
		const hash = await this.txindex.db.get(layout.h.encode(height));
		const blockHeader = await this.db.get(layout.B.encode(hash));
		
		return blockHeader;
	}

	async getRedeemTx(hash) {
		console.log("getRedeemTx(hash)");
		console.log("issue hash", hash);
		const issueHashIndex = await this.db.get(layout.d.encode(hash));
		if (!issueHashIndex) 
			return;
		const issueHashIndexInt = uInt32BEToInt(issueHashIndex);
		const redeemHashIndex = await this.db.get(layout.r.encode(issueHashIndexInt));
		console.log("redeemHashIndex", redeemHashIndex);
		if (!redeemHashIndex) {
			console.log("No redeem hash index found");
			return;
		}
		const redeemHashIndexInt = uInt32BEToInt(redeemHashIndex);
		const redeemHash = await this.db.get(layout.E.encode(redeemHashIndexInt));
		const meta = await this.txindex.getMeta(redeemHash);
		console.log("meta", meta);
		meta.tx = await this.addSlpInfoToTx(meta.tx);
		const metaJson = await this.getMetaJson(meta);

		return metaJson;
	}

	/**
	 * Retrieve a SLP info from the mempool or chain database
	 * and add it to tx
	 * @param {Tx} tx the tx to use 
	 * @returns {Promise} - Returns {@link TX}
	 */
	async addSlpInfoToTx(tx) {
		if (!tx)
			return tx;
		  
		  const hash = tx.hash();
		  const records = await this.getSlpCoinRecords(hash);
		  
		  // Add slp records to outputs and token info to tx
		  if (records.length > 0) {
			// Ignore unsupported SLP types (ie. NFT1)
			if (!records[0].tokenId)
			  return tx;
			  
			const tokenIdHash = Buffer.from(records[0].tokenId).reverse();
			const tokenRecord = await this.getSlpTokenRecord(tokenIdHash);
			tx.slpToken = tokenRecord;
	  
			for (let i = 0; i < tx.outputs.length; i++) {
			  const recordForIndex = records.find(r => i == r.vout);
			  if (recordForIndex)
				tx.outputs[i].slp = recordForIndex;
			}
		  }
	  
		  return tx;
	}

  	/**
	 * Retrieve a SLP info for a transaction from the mempool or chain database.
	 * @param {Hash} hash
	 * @returns {Promise} - Returns {@link TokenRecord | SLPCoinRecord}[]
	 */
	async getSlpCoinRecords(hash) {
		if (this.slpindex) {
			const memRecords = this.mempool.getSlp(hash);
			if (memRecords)
				  return memRecords;
	  
			const dbRecords = await this.slpindex.getSlpCoinRecords(hash);
			if (dbRecords)
				  return dbRecords;
		  }
	  
		  return [];
	}

	/**
	 * Retrieve a SLP Token info from the mempool or chain database.
	 * @param {Hash} hash the token ID for the token 
	 * @returns {Promise} - Returns {@link TokenRecord}
	 */
	async getSlpTokenRecord(hash) {

		if (this.slpindex) {
			// const memRecords = this.mempool.getSlp(hash);
			// if(memRecords && memRecords.length > 0) {
			//   const memRecord = memRecords.find(r => r.decimals != undefined);
			//   // console.log('memRecord', memRecord)
			//   if (memRecord)
			// 	return memRecord;
			// }
	  
			const dbRecord = await this.slpindex.getTokenRecord(hash);
			// console.log('dbRecord', dbRecord)
			if (dbRecord)
			  return dbRecord;
		  }
	  
		  return null;
	}

	/**
	 * Return a tx json with slp details ready to send as response
	 * @param {TXMeta} meta
	 * @returns {JSON} - tx json 	
	 **/
	async getMetaJson(meta) {
		const view = await this.getMetaView(meta);
        const metaJson = meta.getJSON(this.network.type, view, this.chain.height);
		for (let i = 0; i < metaJson.inputs.length; i++) {
			metaJson.inputs[i].coin.hash = metaJson.inputs[i].prevout.hash;
			metaJson.inputs[i].coin.index = metaJson.inputs[i].prevout.index;
			const coin = Coin.fromJSON(metaJson.inputs[i].coin);
			const slpCoin = await this.addSlpInfoToCoin(coin);
			metaJson.inputs[i].coin = slpCoin.toJSON();
		}

		return metaJson;
	}

	/**
	 * Retrieve a spent coin viewpoint from mempool or chain database.
	 * @param {TXMeta} meta
	 * @returns {Promise} - Returns {@link CoinView}.
	 */
	async getMetaView(meta) {
		// if (meta.height === -1)
		// 	return this.mempool.getSpentView(meta.tx);
	  
		const spentView = await this.txindex.getSpentView(meta.tx);

		return spentView;
	}
	
	/**
	 * Retrieve a SLP info from the mempool or chain database
	 * and add it to coin
	 * @param {Coin} coin the coin to use
	 * @returns {Promise} - Returns {@link TX}
	 */
	async addSlpInfoToCoin(coin) {
		if (!coin) 
			return coin;
		  
		  const records = await this.getSlpCoinRecords(coin.hash);
		  // Add slp records to coin
		  if (records.length > 0)
			coin.slp = records.find(r => coin.index == r.vout);
	  
		  return coin;
	}


}
  
  module.exports = TicketIndexer;
