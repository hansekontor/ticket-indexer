/**
 * Count
 */

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


module.exports = { Count };