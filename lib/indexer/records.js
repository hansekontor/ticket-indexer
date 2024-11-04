const bio = require('bufio');
const consensus = require('bcash/lib/protocol/consensus');
const assert = require('bsert');


class Count {
    /**
     * Create count record.
     * @constructor
     * @param {Number} height
     * @param {Number} index
     */
  
    constructor(height, index) {
      this.height = height || 0;
      this.index = index || 0;
  
      assert((this.height >>> 0) === this.height);
      assert((this.index >>> 0) === this.index);
    }
  
    /**
     * Serialize.
     * @returns {Buffer}
     */
  
    toRaw() {
      const bw = bio.write(8);
  
      bw.writeU32(this.height);
      bw.writeU32(this.index);
  
      return bw.render();
    }
  
    /**
     * Deserialize.
     * @private
     * @param {Buffer} data
     */
  
    fromRaw(data) {
      const br = bio.read(data);
  
      this.height = br.readU32();
      this.index = br.readU32();
  
      return this;
    }
  
    /**
     * Instantiate a count from a buffer.
     * @param {Buffer} data
     * @returns {Count}
     */
  
    static fromRaw(data) {
      return new this().fromRaw(data);
    }
}

class BlockRecord {
	/**
	 * Create a block record.
	 * @constructor
	 */
  
	constructor(options = {}) {
	  this.start = options.start;
	  this.last = options.last;
  
	  if (this.start)
		assert(this.start.length === 4, 'start buffer must be 4 bytes in length');
	  if (this.last)
		assert(this.last.length === 4, 'start buffer must be 4 bytes in length');
	}
  
	/**
	 * Inject properties from serialized data.
	 * @private
	 * @param {Buffer} data
	 */
  
	fromRaw(data) {
	  const br = bio.read(data);
  
	  this.start = br.readBytes(4);
	  this.last = br.readBytes(4);
  
	  return this;
	}
  
	/**
	 * Instantiate block record from serialized data.
	 * @param {Buffer} start
	 * @param {Buffer} last
	 * @returns {BlockRecord}
	 */
  
	static fromRaw(data) {
	  return new this().fromRaw(data);
	}
  
	/**
	 * Serialize the block record.
	 * @returns {Buffer}
	 */
  
	toRaw() {
	  assert(this.last.length === 4);
	  assert(this.start.length === 4);
	  const bw = bio.write(8);
  
	  bw.writeBytes(this.start);
	  bw.writeBytes(this.last);
  
	  return bw.render();
	}
  }

module.exports = { Count, BlockRecord };